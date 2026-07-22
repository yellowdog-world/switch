// switchEngine.js와 동일 알고리즘 + 월 적립 지원 버전.
// switchEngine.js는 수정하지 않음.

const FIRST_DAY_GAP_FILTER = 1.10;
const BUY_RATE = 0.002;

/**
 * @param {Array} prices - 가격 배열 [{date, close}]
 * @param {number} investmentUSD - 초기 투자금 (monthly 모드면 0)
 * @param {Object} opts
 *   - startFrom: "YYYY-MM-DD" (시뮬레이션 시작일)
 *   - maxPorang: 분할 수 (기본 15)
 *   - monthlyContribution: 월 적립금 (기본 0)
 *   - contributionDay: 적립일 (기본 10)
 *   - investMode: 'lump' | 'monthly' | 'both'
 */
export function runSwitchCompare(prices, investmentUSD, {
  startFrom = null,
  maxPorang = 15,
  monthlyContribution = 0,
  contributionDay = 10,
  investMode = 'both',
} = {}) {
  const MAX_PORANG = maxPorang;

  const initialCash = investMode === 'monthly' ? 0 : investmentUSD;
  let cash = initialCash;
  let totalInvested = initialCash;

  // 단위금액: 거치 기준 or 연간 적립 기준
  const unitBase = investMode === 'monthly'
    ? monthlyContribution * 12
    : investmentUSD;
  const unitAmount = Math.max(unitBase, 1) / MAX_PORANG;

  let port = 0;
  let rankBundles = [];
  let lp = null;
  let lastUpdownPrice = null;
  let totalShares = 0;

  const startIdx = startFrom
    ? Math.max(prices.findIndex(p => p.date >= startFrom), 0)
    : 0;
  const startYearMonth = prices[startIdx]?.date.slice(0, 7) ?? '';
  let lastContribYearMonth = startYearMonth;

  const dailyLog = [];

  for (let i = startIdx; i < prices.length; i++) {
    const today = prices[i];
    const yesterday = i > 0 ? prices[i - 1] : null;

    // ── 월 적립 ──────────────────────────────────────────────────────────
    let isContribDay = false;
    if (monthlyContribution > 0 && investMode !== 'lump') {
      const ym = today.date.slice(0, 7);
      const dom = parseInt(today.date.slice(8), 10);
      if (ym !== lastContribYearMonth && dom >= contributionDay) {
        cash += monthlyContribution;
        totalInvested += monthlyContribution;
        lastContribYearMonth = ym;
        isContribDay = true;
      }
    }

    // ── LP 재계산 ─────────────────────────────────────────────────────────
    if (yesterday) {
      if ((port > 0 && rankBundles.length === 0) || lastUpdownPrice === null) {
        lp = yesterday.close;
      } else {
        lp = lastUpdownPrice;
      }
    }

    const porang = port + rankBundles.length;
    const rankCountBefore = rankBundles.length;

    let updownBuy = false;
    let virtualBuy = false;
    let updownSell = false;
    let tteobBuy = false;

    // ── 1. 업다운 매수 ────────────────────────────────────────────────────
    if (lp !== null) {
      if (lastUpdownPrice === null) {
        // 최초 진입: 급등일 제외
        if (yesterday && porang < MAX_PORANG &&
            today.close <= yesterday.close * FIRST_DAY_GAP_FILTER) {
          const shares = Math.floor(unitAmount / today.close);
          const spent = shares * today.close;
          if (shares > 0 && cash >= spent) {
            totalShares += shares;
            cash -= spent;
            lastUpdownPrice = today.close;
            lp = today.close;
            port += 1;
            updownBuy = true;
          }
        }
      } else {
        const threshold = lp * (1 - BUY_RATE * porang);
        if (today.close <= threshold) {
          if (porang < MAX_PORANG) {
            const shares = Math.floor(unitAmount / today.close);
            const spent = shares * today.close;
            if (shares > 0 && cash >= spent) {
              totalShares += shares;
              cash -= spent;
              lastUpdownPrice = today.close;
              lp = today.close;
              port += 1;
              updownBuy = true;
            } else {
              // 현금 부족 → 샀다치고
              lastUpdownPrice = today.close;
              lp = today.close;
              virtualBuy = true;
            }
          } else {
            // 포랭 MAX → 샀다치고
            lastUpdownPrice = today.close;
            lp = today.close;
            virtualBuy = true;
          }
        }
      }
    }

    // ── 2. 업다운 매도 ────────────────────────────────────────────────────
    if (!updownBuy && !virtualBuy && port > 0 && lp !== null && today.close >= lp) {
      const sellShares = Math.floor(totalShares / port);
      if (sellShares > 0) {
        cash += sellShares * today.close;
        totalShares -= sellShares;
        lastUpdownPrice = today.close;
        lp = today.close;
        port -= 1;
        if (port === 0 && rankBundles.length === 0) lastUpdownPrice = null;
        updownSell = true;
      }
    }

    // ── 3. 떨법 매수 ──────────────────────────────────────────────────────
    const newPorang = port + rankBundles.length;
    if (yesterday && today.close < yesterday.close && newPorang < MAX_PORANG) {
      const orderPrice = yesterday.close - 0.01;
      if (today.close <= orderPrice) {
        const shares = Math.floor(unitAmount / today.close);
        const spent = shares * today.close;
        if (shares > 0 && cash >= spent) {
          cash -= spent;
          rankBundles.push({ buyPrice: today.close, shares, amount: spent });
          tteobBuy = true;
        }
      }
    }

    // ── 4. 떨법 매도 ──────────────────────────────────────────────────────
    let tteobSells = 0;
    rankBundles = rankBundles.filter((b, bi) => {
      if (bi >= rankCountBefore) return true; // 당일 매수 → 당일 매도 불가
      if (today.close >= b.buyPrice) {
        cash += b.shares * today.close;
        tteobSells++;
        return false;
      }
      return true;
    });

    const rankValue = rankBundles.reduce((s, b) => s + b.shares * today.close, 0);
    const totalValue = cash + totalShares * today.close + rankValue;
    const returnPct = totalInvested > 0
      ? (totalValue - totalInvested) / totalInvested * 100
      : 0;

    dailyLog.push({
      date: today.date,
      close: today.close,
      totalValue: parseFloat(totalValue.toFixed(2)),
      totalInvested: parseFloat(totalInvested.toFixed(2)),
      returnPct: parseFloat(returnPct.toFixed(2)),
      port,
      rank: rankBundles.length,
      porang: port + rankBundles.length,
      isContribDay,
      updownBuy,
      updownSell,
      virtualBuy,
      tteobBuy,
      tteobSells,
    });
  }

  const last = dailyLog[dailyLog.length - 1];
  const finalInvested = last?.totalInvested ?? totalInvested;
  const finalValue = last?.totalValue ?? initialCash;
  return {
    dailyLog,
    finalValue,
    totalInvested: finalInvested,
    totalReturn: finalInvested > 0 ? (finalValue - finalInvested) / finalInvested * 100 : 0,
  };
}

/**
 * QLD 바이앤홀드 (월 적립 지원)
 */
export function runQldBuyHold(prices, investmentUSD, {
  startFrom = null,
  monthlyContribution = 0,
  contributionDay = 10,
  investMode = 'both',
} = {}) {
  const startIdx = startFrom
    ? Math.max(prices.findIndex(p => p.date >= startFrom), 0)
    : 0;
  const startYearMonth = prices[startIdx]?.date.slice(0, 7) ?? '';
  let lastContribYearMonth = startYearMonth;

  const initialCash = investMode === 'monthly' ? 0 : investmentUSD;
  let cash = initialCash;
  let shares = 0;
  let totalInvested = initialCash;

  const dailyLog = [];

  for (let i = startIdx; i < prices.length; i++) {
    const today = prices[i];

    // ── 월 적립 ──────────────────────────────────────────────────────────
    let isContribDay = false;
    if (monthlyContribution > 0 && investMode !== 'lump') {
      const ym = today.date.slice(0, 7);
      const dom = parseInt(today.date.slice(8), 10);
      if (ym !== lastContribYearMonth && dom >= contributionDay) {
        cash += monthlyContribution;
        totalInvested += monthlyContribution;
        lastContribYearMonth = ym;
        isContribDay = true;
      }
    }

    // 보유 현금 전액 매수
    if (cash > 0 && today.close > 0) {
      const newShares = Math.floor(cash / today.close);
      if (newShares > 0) {
        shares += newShares;
        cash -= newShares * today.close;
      }
    }

    const totalValue = shares * today.close + cash;
    const returnPct = totalInvested > 0
      ? (totalValue - totalInvested) / totalInvested * 100
      : 0;

    dailyLog.push({
      date: today.date,
      close: today.close,
      shares,
      totalValue: parseFloat(totalValue.toFixed(2)),
      totalInvested: parseFloat(totalInvested.toFixed(2)),
      returnPct: parseFloat(returnPct.toFixed(2)),
      isContribDay,
    });
  }

  const last = dailyLog[dailyLog.length - 1];
  const finalInvested = last?.totalInvested ?? totalInvested;
  const finalValue = last?.totalValue ?? initialCash;
  return {
    dailyLog,
    finalValue,
    totalInvested: finalInvested,
    totalReturn: finalInvested > 0 ? (finalValue - finalInvested) / finalInvested * 100 : 0,
  };
}
