import { useState } from "react";
import Controls from "./components/Controls";
import Charts from "./components/Charts";
import Summary from "./components/Summary";
import ScanPage from "./components/ScanPage";
import RollingPage from "./components/RollingPage";
import { runBacktest } from "./engine/switchEngine";
import { fetchPrices } from "./utils/stockCache";

export default function App() {
  const [mode, setMode] = useState(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("mode") === "backtest" || p.get("symbol")) return "backtest";
    return "scan";
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [params, setParams] = useState(null);
  const [rawPrices, setRawPrices] = useState(null); // 롤링 분석용 원본 가격 데이터

  async function handleRun({ symbol, from, to, investment, porang = 15 }) {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      // 엔진의 LP 계산은 "어제 종가"가 필요한데, from 첫날엔 어제 데이터가 없음.
      // 7일 앞당겨 데이터를 요청해서 lookback 구간을 확보.
      // 주말/공휴일 연속으로 있어도 5일이면 충분하지만 여유있게 7일.
      // 실제 시뮬레이션은 from 날짜부터만 돌아가도록 runBacktest에 startFrom을 전달.
      const lookbackFrom = new Date(from);
      lookbackFrom.setDate(lookbackFrom.getDate() - 7);
      const lookbackFromStr = lookbackFrom.toISOString().split('T')[0];

      const data = await fetchPrices(symbol, lookbackFromStr, to);
      if (data.prices.length < 2)
        throw new Error("해당 기간 데이터가 부족합니다.");

      setRawPrices(data.prices); // 롤링 분석에서 재활용
      const backtestResult = runBacktest(data.prices, investment, from, porang);

      setResult(backtestResult);
      setParams({ symbol, symbolName: data.symbolName || symbol, from, to, investment, porang });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <div className="header-top">
            <div className="logo">
              <span className="logo-mark">S</span>
              <div>
                <div className="logo-title">YELLOWDOG METHOD</div>
                <div className="logo-sub">Backtest Engine</div>
              </div>
            </div>
            <nav className="main-nav">
              <button className={`nav-btn ${mode === "scan" ? "nav-active" : ""}`} onClick={() => setMode("scan")}>종목 스캔</button>
              <button className={`nav-btn ${mode === "backtest" ? "nav-active" : ""}`} onClick={() => setMode("backtest")}>백테스트</button>
              <button className={`nav-btn ${mode === "rolling" ? "nav-active" : ""}`} onClick={() => setMode("rolling")}>롤링 분석</button>
            </nav>
          </div>
        </div>
      </header>

      <main className="main">
        {mode === "scan" && <ScanPage />}
        {mode === "rolling" && <RollingPage prices={rawPrices} params={params} onGoBacktest={() => setMode("backtest")} />}

        {mode === "backtest" && (
          <>
            <Controls onRun={handleRun} loading={loading} />

            {error && (
              <div className="error-box">
                <span className="error-icon">⚠</span> {error}
              </div>
            )}

            {loading && (
              <div className="loading-box">
                <div className="spinner" />
                <span>데이터 로딩 및 시뮬레이션 중...</span>
              </div>
            )}

            {result && params && (
              <>
                <Summary summary={result.summary} params={params} />
                <Charts dailyLog={result.dailyLog} cycles={result.cycles} symbol={params.symbol} symbolName={params.symbolName} maxPorang={params.porang} />
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
