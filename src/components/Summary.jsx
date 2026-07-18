export default function Summary({ summary, params, dailyLog }) {
  const { totalReturn, finalValue, totalCycles, dongCount, virtualBuyCount, maxDrawdown } = summary;
  const isPositive = totalReturn >= 0;

  const firstClose = dailyLog?.[0]?.close;
  const lastClose = dailyLog?.[dailyLog.length - 1]?.close;
  const buyHoldReturn = firstClose && lastClose
    ? ((lastClose - firstClose) / firstClose) * 100
    : null;
  const prefix = params.symbol.endsWith(".KS") ? "₩" : "$";

  const buyHoldMdd = (() => {
    if (!dailyLog?.length) return null;
    let peak = dailyLog[0].close;
    let maxDD = 0;
    for (const d of dailyLog) {
      if (d.close > peak) peak = d.close;
      const dd = (peak - d.close) / peak * 100;
      if (dd > maxDD) maxDD = dd;
    }
    return maxDD;
  })();

  return (
    <section className="summary-section">
      <h2 className="section-title">
        {params.symbol} 백테스트 결과
        <span className="section-sub">
          {params.from} ~ {params.to} / 투자금 ${params.investment.toLocaleString()}
        </span>
      </h2>

      <div className="stats-grid">
        <StatCard
          label="총 수익률"
          value={`${isPositive ? "+" : ""}${totalReturn.toFixed(2)}%`}
          highlight={isPositive ? "positive" : "negative"}
        />
        <StatCard
          label="최종 평가액"
          value={`$${finalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
        />
        <StatCard
          label="완료 사이클"
          value={`${totalCycles}회`}
        />
        <StatCard
          label="똥 이월 횟수"
          value={`${dongCount}회`}
          highlight={dongCount > 0 ? "warning" : "neutral"}
        />
        <StatCard
          label="샀다치고 횟수"
          value={`${virtualBuyCount}회`}
          highlight={virtualBuyCount > 0 ? "warning" : "neutral"}
        />
        <StatCard
          label="최대 낙폭 (MDD)"
          value={`-${maxDrawdown.toFixed(2)}%`}
          highlight="negative"
        />
        {buyHoldReturn !== null && (
          <StatCard
            label={`${params.symbol} 본주 보유`}
            value={`${buyHoldReturn >= 0 ? "+" : ""}${buyHoldReturn.toFixed(2)}%`}
            sub={`${prefix}${firstClose.toFixed(2)} → ${prefix}${lastClose.toFixed(2)}`}
            highlight={buyHoldReturn >= 0 ? "positive" : "negative"}
          />
        )}
        {buyHoldMdd !== null && (
          <StatCard
            label={`${params.symbol} 본주 MDD`}
            value={`-${buyHoldMdd.toFixed(2)}%`}
            highlight="negative"
          />
        )}
      </div>
    </section>
  );
}

function StatCard({ label, value, sub, highlight }) {
  return (
    <div className={`stat-card ${highlight ? `stat-${highlight}` : ""}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}
