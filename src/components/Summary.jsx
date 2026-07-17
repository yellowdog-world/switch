export default function Summary({ summary, params }) {
  const { totalReturn, finalValue, totalCycles, dongCount, virtualBuyCount, maxDrawdown } = summary;
  const isPositive = totalReturn >= 0;

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
      </div>
    </section>
  );
}

function StatCard({ label, value, highlight }) {
  return (
    <div className={`stat-card ${highlight ? `stat-${highlight}` : ""}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  );
}
