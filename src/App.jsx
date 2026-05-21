import { useState } from "react";
import Controls from "./components/Controls";
import Charts from "./components/Charts";
import Summary from "./components/Summary";
import { runBacktest } from "./engine/switchEngine";

export default function App() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [params, setParams] = useState(null);

  async function handleRun({ symbol, from, to, investment }) {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      // 첫날 어제종가 확보를 위해 7일 앞당겨 데이터 요청
      const lookbackFrom = new Date(from);
      lookbackFrom.setDate(lookbackFrom.getDate() - 7);
      const lookbackFromStr = lookbackFrom.toISOString().split('T')[0];

      const res = await fetch(
        `/api/stock?symbol=${encodeURIComponent(symbol)}&from=${lookbackFromStr}&to=${to}`
      );
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "데이터 로드 실패");
      if (!data.prices || data.prices.length < 2)
        throw new Error("해당 기간 데이터가 부족합니다.");

      const backtestResult = runBacktest(data.prices, investment);

      // 사용자가 선택한 from 이전 날짜는 표시에서 제거
      backtestResult.dailyLog = backtestResult.dailyLog.filter(d => d.date >= from);

      setResult(backtestResult);
      setParams({ symbol, from, to, investment });
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
          <div className="logo">
            <span className="logo-mark">S</span>
            <div>
              <div className="logo-title">YELLOWDOG METHOD</div>
              <div className="logo-sub">Backtest Engine</div>
            </div>
          </div>
        </div>
      </header>

      <main className="main">
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
            <Charts dailyLog={result.dailyLog} cycles={result.cycles} />
          </>
        )}
      </main>
    </div>
  );
}
