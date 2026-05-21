/**
 * 스위치법 백테스트 엔진
 *
 * 용어:
 *   포트(port)  - 업다운 매수 횟수
 *   랭크(rank)  - 떨법 묶음 수
 *   포랭        - 포트 + 랭크 (최대 15)
 *   LP          - 업다운 매수/매도 기준가
 *                 · 포트>0, 랭크=0 → 매일 어제종가로 갱신
 *                 · 업다운 미진입(lastUpdownPrice=null) → 어제종가
 *                 · 그 외 → lastUpdownPrice 고정
 *   lastUpdownPrice - 마지막 업다운 체결가 (W열)
 */

const MAX_PORANG = 15;

export function runBacktest(prices, investmentUSD, startFrom = null) {
  const unitAmount = investmentUSD / MAX_PORANG; // 1회 매수금액

  // 상태
  let port = 0;
  let rankBundles = []; // [{ buyPrice, shares, amount }]
  let lp = null;
  let lastUpdownPrice = null; // 마지막 업다운 체결가 (사이클 종료 시 null 초기화)
  let totalShares = 0; // 업다운 보유 주식 수
  let cash = investmentUSD;

  // 결과 기록
  const dailyLog = [];
  const cycles = [];

  // startFrom 이전 데이터는 어제종가 확보용 lookback으로만 사용
  const startIdx = startFrom
    ? Math.max(prices.findIndex(p => p.date >= startFrom), 0)
    : 0;

  let cycleStartIdx = startIdx;
  let cycleStartCash = cash;
  let dongCount = 0;
  let currentCycleNum = 1;

  for (let i = startIdx; i < prices.length; i++) {
    const today = prices[i];
    const yesterday = prices[i - 1];

    // ── LP 재계산 (루프 시작 시) ──────────────────────
    // 포트>0, 랭크=0: 업다운만 보유 → LP = 어제종가 (매일 갱신)
    // 아직 업다운 매수 없음: LP = 어제종가
    // 그 외: LP = lastUpdownPrice 고정
    if (yesterday) {
      if ((port > 0 && rankBundles.length === 0) || lastUpdownPrice === null) {
        lp = yesterday.close;
      } else {
        lp = lastUpdownPrice;
      }
    }

    const porang = port + rankBundles.length;

    let action = [];
    let updownBuy = false;
    let updownSell = false;
    let tteobBuy = false;
    let tteobSells = [];
    const rankCountBefore = rankBundles.length; // 오늘 새로 산 떨법 묶음 구분용

    // ── 1. 업다운 매수 ──────────────────────────────
    if (porang < MAX_PORANG && lp !== null) {
      if (lastUpdownPrice === null) {
        // 최초 진입: 어제 종가 대비 10% 이내 (급등 제외)
        if (today.close <= yesterday.close * 1.10) {
          const shares = Math.floor(unitAmount / today.close);
          const spent = shares * today.close;
          totalShares += shares;
          cash -= spent;
          lastUpdownPrice = today.close;
          lp = today.close;
          port += 1;
          updownBuy = true;
          action.push(`업다운 매수 (첫날) @${today.close.toFixed(2)}(${shares}주)`);
        }
      } else {
        // 추가 매수: LP × (1 - 0.2% × 포랭) 이하
        const threshold = lp * (1 - 0.002 * porang);
        if (today.close <= threshold) {
          const shares = Math.floor(unitAmount / today.close);
          const spent = shares * today.close;
          totalShares += shares;
          cash -= spent;
          lastUpdownPrice = today.close;
          lp = today.close;
          port += 1;
          updownBuy = true;
          action.push(`업다운 매수 (${porang + 1}차) @${today.close.toFixed(2)}(${shares}주)`);
        }
      }
    }

    // ── 2. 업다운 매도 ──────────────────────────────
    // 매수와 같은 날 매도는 하지 않음
    if (!updownBuy && port > 0 && lp !== null && today.close >= lp) {
      const currentPorang = port + rankBundles.length;
      const sellShares = Math.floor(totalShares / currentPorang);
      const sellAmount = sellShares * today.close;
      totalShares -= sellShares;
      cash += sellAmount;
      lastUpdownPrice = today.close;
      lp = today.close;
      port -= 1;
      updownSell = true;
      action.push(`업다운 매도 @${today.close.toFixed(2)}(${sellShares}주)`);
    }

    // ── 3. 떨법 매수 ──────────────────────────────
    // 조건: 하락일 + 오늘종가 ≤ 어제종가-0.01
    // 매입가: 실제 체결 기준인 오늘 종가 (지정가 아닌 종가 기준)
    const newPorang = port + rankBundles.length;
    if (yesterday && today.close < yesterday.close && newPorang < MAX_PORANG) {
      const orderPrice = yesterday.close - 0.01;
      if (today.close <= orderPrice) {
        const shares = Math.floor(unitAmount / today.close);
        const spent = shares * today.close;
        rankBundles.push({ buyPrice: today.close, shares, amount: spent });
        cash -= spent;
        tteobBuy = true;
        action.push(`떨법 매수 @${today.close.toFixed(2)}(${shares}주) (랭크${rankBundles.length})`);
      }
    }

    // ── 4. 떨법 매도 ── (오늘 새로 산 묶음은 당일 매도 제외)
    const remaining = [];
    for (let bi = 0; bi < rankBundles.length; bi++) {
      const bundle = rankBundles[bi];
      const isTodayBought = bi >= rankCountBefore;
      if (!isTodayBought && today.close >= bundle.buyPrice) {
        const sellAmount = bundle.shares * today.close;
        cash += sellAmount;
        tteobSells.push(bundle);
        action.push(`떨법 매도 @${today.close.toFixed(2)}(${bundle.shares}주) (매입 @${bundle.buyPrice.toFixed(2)})`);
      } else {
        remaining.push(bundle);
      }
    }
    rankBundles = remaining;

    // ── 5. 사이클 종료 체크 ──────────────────────────
    if (updownSell && port === 0) {
      if (rankBundles.length > 0) {
        // 똥 이월
        dongCount += 1;
        const dongBundles = [...rankBundles];
        port = dongBundles.length; // 묶음 수만큼 포트로
        // 업다운 보유 수량에 떨법 물량 합산
        for (const b of dongBundles) totalShares += b.shares;
        rankBundles = [];
        action.push(`⚠️ 똥 이월! ${dongBundles.length}묶음 → 포트=${port}`);

        cycles.push({
          cycleNum: currentCycleNum,
          startDate: prices[cycleStartIdx].date,
          endDate: today.date,
          pnl: cash - cycleStartCash,
          pnlPct: ((cash - cycleStartCash) / cycleStartCash) * 100,
          dong: true,
          dongBundles: dongBundles.length,
        });
      } else {
        // 깔끔 종료 → 새 사이클을 위해 lastUpdownPrice 초기화
        lastUpdownPrice = null;
        cycles.push({
          cycleNum: currentCycleNum,
          startDate: prices[cycleStartIdx].date,
          endDate: today.date,
          pnl: cash - cycleStartCash,
          pnlPct: ((cash - cycleStartCash) / cycleStartCash) * 100,
          dong: false,
          dongBundles: 0,
        });
        cycleStartCash = cash;
        cycleStartIdx = i + 1;
        currentCycleNum += 1;
      }
    }

    // ── 포트폴리오 평가액 계산 ──────────────────────
    const updownValue = totalShares * today.close;
    const tteobValue = rankBundles.reduce((sum, b) => sum + b.shares * today.close, 0);
    const totalValue = cash + updownValue + tteobValue;
    const returnPct = ((totalValue - investmentUSD) / investmentUSD) * 100;

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
      cash: parseFloat(cash.toFixed(2)),
      updownValue: parseFloat(updownValue.toFixed(2)),
      tteobValue: parseFloat(tteobValue.toFixed(2)),
      action: action.join(' / ') || '-',
      updownBuy,
      updownSell,
      tteobBuy,
      tteobSellCount: tteobSells.length,
    });
  }

  const finalValue = dailyLog[dailyLog.length - 1]?.totalValue ?? investmentUSD;
  const totalReturn = ((finalValue - investmentUSD) / investmentUSD) * 100;
  const maxDrawdown = calcMaxDrawdown(dailyLog.map(d => d.totalValue));

  return {
    dailyLog,
    cycles,
    summary: {
      totalReturn: parseFloat(totalReturn.toFixed(2)),
      finalValue: parseFloat(finalValue.toFixed(2)),
      totalCycles: cycles.length,
      dongCount,
      maxDrawdown: parseFloat(maxDrawdown.toFixed(2)),
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
