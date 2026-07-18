/**
 * 스위치법 백테스트 엔진
 *
 * ── 용어 ──────────────────────────────────────────────────────────────
 *   포트(port)  - 업다운 매수 횟수. 1회 매수금액 = 투자금 ÷ MAX_PORANG
 *   랭크(rank)  - 떨법 묶음 수. 각 묶음은 독립적으로 매입가 이상이면 매도
 *   포랭        - 포트 + 랭크. MAX_PORANG(기본 15)이 상한
 *   LP          - 업다운 매수/매도 기준가. 상황에 따라 갱신 방식이 다름:
 *                   포트>0 & 랭크=0 → 매일 어제종가로 갱신 (손실 없이 매도 기회 최대화)
 *                   업다운 미진입   → 어제종가 (아직 시작 전)
 *                   그 외          → lastUpdownPrice 고정 (랭크 보유 중엔 기준가 고정)
 *   lastUpdownPrice - 마지막 업다운 체결가. 사이클 깔끔 종료 시 null 초기화
 *
 * ── 평단(avgCost) 계산 방식 ───────────────────────────────────────────
 *   totalUpdownCost = 업다운으로 매수한 주식들의 총 매입원가 누계
 *   매수할 때마다 += spent
 *   매도할 때는 평균단가 기준으로 비례 차감: -= (avgCost × sellShares)
 *     → FIFO가 아니라 평균 단가 방식을 쓰는 이유:
 *       포트 1개씩 매도하는데 어느 묶음을 팔았는지 추적하지 않기 때문
 *   똥 이월 시 rankBundles.amount도 totalUpdownCost에 합산:
 *     → 랭크 묶음이 포트로 전환되므로 원가 추적에 포함해야 평단이 정확해짐
 */

export function runBacktest(prices, investmentUSD, startFrom = null, maxPorang = 15, buyRate = 0.002, opts = {}) {
  const {
    virtualBuyMode = 'update_lp', // 'update_lp' | 'keep_lp' | 'always_buy'
    updownSellBuffer = 0,
    tteobSellBuffer = 0,
    tteobOrderPct = null,
    firstDayGapFilter = 1.10,
    splitWeightMode = 'equal',    // 'equal' | 'linear_up'(역피라미드) | 'linear_down'(피라미드)
  } = opts;

  const MAX_PORANG = maxPorang;

  // 차수별 매수금액 배열 (splitWeightMode에 따라 비중 조정)
  const splitAmounts = (() => {
    if (splitWeightMode === 'linear_up') {
      // 역피라미드: 후반 차수일수록 더 많이 (1, 2, 3, ..., n)
      const w = Array.from({ length: MAX_PORANG }, (_, i) => i + 1);
      const total = w.reduce((s, v) => s + v, 0);
      return w.map(v => (investmentUSD * v) / total);
    }
    if (splitWeightMode === 'linear_down') {
      // 피라미드: 초반 차수일수록 더 많이 (n, n-1, ..., 1)
      const w = Array.from({ length: MAX_PORANG }, (_, i) => MAX_PORANG - i);
      const total = w.reduce((s, v) => s + v, 0);
      return w.map(v => (investmentUSD * v) / total);
    }
    return Array(MAX_PORANG).fill(investmentUSD / MAX_PORANG);
  })();
  // splitAmounts 범위 초과 시 마지막 값 사용 (always_buy 모드에서 포랭 무제한 시)
  const getUnitAmount = (splitIdx) => splitAmounts[Math.min(splitIdx, MAX_PORANG - 1)];

  // ── 상태 변수 ────────────────────────────────────────────────────────
  let port = 0;
  let rankBundles = []; // 떨법 묶음 배열. 각 원소: { buyPrice, shares, amount }
  let lp = null;
  let lastUpdownPrice = null; // 마지막 업다운 체결가. 깔끔 종료 시 null 초기화
  let totalShares = 0;        // 업다운 보유 주식 수 (포트 전체 합산)
  let totalUpdownCost = 0;    // 업다운 보유 주식의 총 매입원가 (평단 계산용)
  let cash = investmentUSD;

  const dailyLog = [];
  const cycles = [];

  // startFrom 이전 데이터: 시뮬레이션에는 포함하지 않고,
  // 첫날 LP 계산에 필요한 "어제 종가"를 확보하기 위한 lookback 용도로만 사용.
  // (호출부에서 from 날짜보다 7일 먼저 데이터를 요청하는 이유)
  const startIdx = startFrom
    ? Math.max(prices.findIndex(p => p.date >= startFrom), 0)
    : 0;

  let cycleStartIdx = startIdx;
  let cycleStartCash = cash; // 각 사이클 시작 시점의 현금. 사이클 수익률 계산 기준
  let dongCount = 0;
  let virtualBuyCount = 0; // 샀다치고 발생 횟수
  let extraBuyNeeded = 0;  // always_buy 모드에서 cash 부족으로 못 산 금액 누계
  let currentCycleNum = 1;

  for (let i = startIdx; i < prices.length; i++) {
    const today = prices[i];
    const yesterday = prices[i - 1]; // startFrom 이전 데이터가 있어서 i=startIdx에서도 안전

    // ── LP 재계산 ─────────────────────────────────────────────────────
    // 매일 루프 시작 시 LP를 결정. 이 값이 오늘의 매수/매도 판단 기준이 됨.
    if (yesterday) {
      if ((port > 0 && rankBundles.length === 0) || lastUpdownPrice === null) {
        lp = yesterday.close; // 포트만 있거나 미진입: 어제 종가로 매일 갱신
      } else {
        lp = lastUpdownPrice; // 랭크 보유 중: 마지막 체결가 고정
      }
    }

    const porang = port + rankBundles.length;

    let action = [];
    let updownBuy = false;
    let virtualBuy = false;
    let updownSell = false;
    let tteobBuy = false;
    let tteobSells = [];
    // 오늘 새로 매수한 떨법 묶음은 당일 매도 불가. bi >= rankCountBefore 인 묶음이 오늘 산 것.
    const rankCountBefore = rankBundles.length;

    // ── 1. 업다운 매수 ────────────────────────────────────────────────
    if (lp !== null) {
      if (lastUpdownPrice === null) {
        // 최초 진입: 급등일(어제 대비 +10% 초과) 제외하고 포랭 여유 있으면 매수
        if (porang < MAX_PORANG && today.close <= yesterday.close * firstDayGapFilter) {
          const shares = Math.floor(getUnitAmount(porang) / today.close);
          const spent = shares * today.close;
          totalShares += shares;
          totalUpdownCost += spent;
          cash -= spent;
          lastUpdownPrice = today.close;
          lp = today.close;
          port += 1;
          updownBuy = true;
          action.push(`업다운 매수 (첫날) @${today.close.toFixed(2)}(${shares}주)`);
        }
      } else {
        // 추가 매수 조건: 종가 ≤ LP × (1 - 0.2% × 현재포랭)
        // 포랭이 높을수록 하락폭 기준이 커져서 더 내려가야 추가 매수
        const threshold = lp * (1 - buyRate * porang);
        if (today.close <= threshold) {
          if (porang < MAX_PORANG) {
            // 실제 매수
            const shares = Math.floor(getUnitAmount(porang) / today.close);
            const spent = shares * today.close;
            totalShares += shares;
            totalUpdownCost += spent;
            cash -= spent;
            lastUpdownPrice = today.close;
            lp = today.close;
            port += 1;
            updownBuy = true;
            action.push(`업다운 매수 (${porang + 1}차) @${today.close.toFixed(2)}(${shares}주)`);
          } else if (virtualBuyMode === 'always_buy') {
            // 포랭 한도 무시하고 계속 실제 매수 (cash 여유 있을 때만)
            const shares = Math.floor(getUnitAmount(porang) / today.close);
            const spent = shares * today.close;
            if (shares > 0 && cash >= spent) {
              totalShares += shares;
              totalUpdownCost += spent;
              cash -= spent;
              lastUpdownPrice = today.close;
              lp = today.close;
              port += 1;
              updownBuy = true;
              action.push(`업다운 매수 (${porang + 1}차·초과) @${today.close.toFixed(2)}(${shares}주)`);
            } else {
              // cash 부족 - 살 수 있었을 금액을 누적
              extraBuyNeeded += Math.floor(getUnitAmount(porang) / today.close) * today.close;
              lastUpdownPrice = today.close;
              lp = today.close;
              virtualBuy = true;
              virtualBuyCount += 1;
              action.push(`샀다치고 (cash 부족) @${today.close.toFixed(2)}`);
            }
          } else {
            // 샀다치고
            if (virtualBuyMode === 'update_lp') {
              lastUpdownPrice = today.close;
              lp = today.close;
            }
            virtualBuy = true;
            virtualBuyCount += 1;
            action.push(`샀다치고 @${today.close.toFixed(2)}`);
          }
        }
      }
    }

    // ── 2. 업다운 매도 ────────────────────────────────────────────────
    // 매수와 같은 날은 매도하지 않음 (updownBuy, virtualBuy 체크)
    // 종가 ≥ LP면 포트 1개 매도 (totalShares / port 주)
    if (!updownBuy && !virtualBuy && port > 0 && lp !== null && today.close >= lp * (1 + updownSellBuffer)) {
      const sellShares = Math.floor(totalShares / port);
      const sellAmount = sellShares * today.close;
      // 평균 단가 기준으로 비례 차감: 매도 주식만큼의 원가를 제거
      totalUpdownCost -= (totalShares > 0 ? (totalUpdownCost / totalShares) * sellShares : 0);
      totalShares -= sellShares;
      cash += sellAmount;
      lastUpdownPrice = today.close;
      lp = today.close;
      port -= 1;
      updownSell = true;
      action.push(`업다운 매도 @${today.close.toFixed(2)}(${sellShares}주)`);
    }

    // ── 3. 떨법 매수 ─────────────────────────────────────────────────
    // 조건: 하락일 + 종가 ≤ 어제종가 - 0.01 + 포랭 여유 있음
    // 어제종가 - 0.01짜리 지정가를 걸어뒀다고 가정, 오늘 종가로 체결
    const newPorang = port + rankBundles.length;
    if (yesterday && today.close < yesterday.close && newPorang < MAX_PORANG) {
      const orderPrice = tteobOrderPct != null ? yesterday.close * (1 - tteobOrderPct) : yesterday.close - 0.01;
      if (today.close <= orderPrice) {
        const shares = Math.floor(getUnitAmount(newPorang) / today.close);
        const spent = shares * today.close;
        rankBundles.push({ buyPrice: today.close, shares, amount: spent });
        cash -= spent;
        tteobBuy = true;
        action.push(`떨법 매수 @${today.close.toFixed(2)}(${shares}주) (랭크${rankBundles.length})`);
      }
    }

    // ── 4. 떨법 매도 ─────────────────────────────────────────────────
    // 각 묶음 독립 판단: 오늘 종가 ≥ 해당 묶음 매입가면 매도
    // 단, 오늘 새로 산 묶음(bi >= rankCountBefore)은 당일 매도 제외
    const remaining = [];
    for (let bi = 0; bi < rankBundles.length; bi++) {
      const bundle = rankBundles[bi];
      const isTodayBought = bi >= rankCountBefore;
      if (!isTodayBought && today.close >= bundle.buyPrice * (1 + tteobSellBuffer)) {
        const sellAmount = bundle.shares * today.close;
        cash += sellAmount;
        tteobSells.push(bundle);
        action.push(`떨법 매도 @${today.close.toFixed(2)}(${bundle.shares}주) (매입 @${bundle.buyPrice.toFixed(2)})`);
      } else {
        remaining.push(bundle);
      }
    }
    rankBundles = remaining;

    // ── 5. 사이클 종료 체크 ──────────────────────────────────────────
    // 업다운 매도로 포트=0이 되면 사이클 종료
    let cycleEndPnlPct = null;
    let cycleEndNum = null;
    if (updownSell && port === 0) {
      // 사이클 수익률 = 이번 사이클 동안의 현금 변화율
      const pnlPct = (cash - cycleStartCash) / cycleStartCash * 100;
      cycleEndPnlPct = parseFloat(pnlPct.toFixed(2));
      cycleEndNum = currentCycleNum;

      if (rankBundles.length > 0) {
        // 똥 이월: 업다운은 다 팔았지만 떨법 묶음이 아직 남아 있는 경우
        // 남은 랭크 묶음을 포트로 전환해서 다음 사이클로 넘김
        // → 이 묶음들의 원가도 totalUpdownCost에 포함해야 평단 계산이 정확해짐
        dongCount += 1;
        const dongBundles = [...rankBundles];
        port = dongBundles.length;
        for (const b of dongBundles) { totalShares += b.shares; totalUpdownCost += b.amount; }
        rankBundles = [];
        action.push(`⚠️ 똥 이월! ${dongBundles.length}묶음 → 포트=${port}`);

        cycles.push({
          cycleNum: currentCycleNum,
          startDate: prices[cycleStartIdx].date,
          endDate: today.date,
          pnl: cash - cycleStartCash,
          pnlPct,
          dong: true,
          dongBundles: dongBundles.length,
        });
        cycleStartCash = cash;
        cycleStartIdx = i + 1;
        currentCycleNum += 1;
      } else {
        // 깔끔 종료: 포트도 0, 랭크도 0 → lastUpdownPrice 초기화로 다음 사이클 새로 시작
        lastUpdownPrice = null;
        cycles.push({
          cycleNum: currentCycleNum,
          startDate: prices[cycleStartIdx].date,
          endDate: today.date,
          pnl: cash - cycleStartCash,
          pnlPct,
          dong: false,
          dongBundles: 0,
        });
        cycleStartCash = cash;
        cycleStartIdx = i + 1;
        currentCycleNum += 1;
      }
    }

    // ── 평가액 계산 ───────────────────────────────────────────────────
    // 현금 + 업다운 보유 평가액 + 랭크 보유 평가액 (모두 오늘 종가 기준)
    const updownValue = totalShares * today.close;
    const tteobValue = rankBundles.reduce((sum, b) => sum + b.shares * today.close, 0);
    const totalValue = cash + updownValue + tteobValue;
    const returnPct = ((totalValue - investmentUSD) / investmentUSD) * 100;
    const cashUsedPct = parseFloat(((investmentUSD - cash) / investmentUSD * 100).toFixed(2));

    dailyLog.push({
      date: today.date,
      close: today.close,
      port,
      rank: rankBundles.length,
      porang: port + rankBundles.length,
      lp: lp ? parseFloat(lp.toFixed(4)) : null,
      lastUpdownPrice: lastUpdownPrice ? parseFloat(lastUpdownPrice.toFixed(4)) : null,
      totalValue: parseFloat(totalValue.toFixed(2)),
      returnPct: parseFloat(returnPct.toFixed(2)),
      cashUsedPct,
      cash: parseFloat(cash.toFixed(2)),
      updownValue: parseFloat(updownValue.toFixed(2)),
      tteobValue: parseFloat(tteobValue.toFixed(2)),
      action: action.join(' / ') || '-',
      updownBuy,
      virtualBuy,
      updownSell,
      tteobBuy,
      tteobSellCount: tteobSells.length,
      // avgCost: 보유 주식이 없으면 null (테이블에서 '-' 표시)
      avgCost: totalShares > 0 ? parseFloat((totalUpdownCost / totalShares).toFixed(4)) : null,
      cycleNum: currentCycleNum,
      cycleEndPnlPct, // 사이클 종료일에만 값, 나머지는 null
      cycleEndNum,
    });
  }

  const finalValue = dailyLog[dailyLog.length - 1]?.totalValue ?? investmentUSD;
  const totalReturn = ((finalValue - investmentUSD) / investmentUSD) * 100;
  const maxDrawdown = calcMaxDrawdown(dailyLog.map(d => d.totalValue));
  // currentCycleReturn: 아직 종료되지 않은 현재 진행 중인 사이클의 수익률
  const currentCycleReturn = parseFloat(((finalValue - cycleStartCash) / cycleStartCash * 100).toFixed(2));

  return {
    dailyLog,
    cycles,
    summary: {
      totalReturn: parseFloat(totalReturn.toFixed(2)),
      finalValue: parseFloat(finalValue.toFixed(2)),
      totalCycles: cycles.length,
      dongCount,
      virtualBuyCount,
      extraBuyNeeded: parseFloat(extraBuyNeeded.toFixed(0)),
      maxDrawdown: parseFloat(maxDrawdown.toFixed(2)),
      currentCycleReturn,
    },
  };
}

function calcMaxDrawdown(values) {
  let peak = values[0];
  let maxDD = 0;
  for (const v of values) {
    if (v > peak) peak = v;
    const dd = ((peak - v) / peak) * 100;
    if (dd > maxDD) maxDD = dd;
  }
  return maxDD;
}
