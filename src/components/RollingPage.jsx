import RollingChart from "./RollingChart";

export default function RollingPage({ prices, params, onGoBacktest }) {
  // 백테스트를 아직 실행하지 않은 경우
  if (!prices || !params) {
    return (
      <section className="rolling-page-empty">
        <div className="rolling-page-empty-inner">
          <div className="rolling-page-empty-title">백테스트를 먼저 실행해주세요</div>
          <div className="rolling-page-empty-desc">
            롤링 분석은 백테스트 설정(종목·기간·투자금·분할)을 그대로 사용합니다.
            백테스트 탭에서 먼저 실행한 뒤 돌아오세요.
          </div>
          <button className="run-btn" onClick={onGoBacktest}>백테스트 탭으로 이동</button>
        </div>
      </section>
    );
  }

  const prefix = params.symbol.endsWith(".KS") ? "₩" : "$";

  return (
    <section className="rolling-page">
      <div className="section-title">
        롤링 분석
        <span className="section-sub">
          {params.symbol} · {params.from} ~ {params.to} · {prefix}{params.investment.toLocaleString()} · {params.porang}분할
        </span>
      </div>
      <RollingChart
        prices={prices}
        investment={params.investment}
        maxPorang={params.porang}
        from={params.from}
        to={params.to}
      />
    </section>
  );
}
