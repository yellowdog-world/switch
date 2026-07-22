import { useState, useEffect, useRef } from "react";
import Controls from "./components/Controls";
import Charts from "./components/Charts";
import Summary from "./components/Summary";
import ScanPage from "./components/ScanPage";
import RollingPage from "./components/RollingPage";
import SensitivityPage from "./components/SensitivityPage";
import CyclePage from "./components/CyclePage";
import GuidePage from "./components/GuidePage";
import QldComparePage from "./components/QldComparePage";
import { runBacktest } from "./engine/switchEngine";
import { fetchPrices } from "./utils/stockCache";

// 노란 진도개 얼굴 로고
function DogLogo() {
  return (
    <svg viewBox="0 0 44 44" width="38" height="38" xmlns="http://www.w3.org/2000/svg">
      {/* 왼쪽 귀 */}
      <polygon points="9,26 14,6 21,20" fill="#F5C140"/>
      <polygon points="11,24 15,10 19,20" fill="#F0A0A0" opacity="0.75"/>
      {/* 오른쪽 귀 */}
      <polygon points="35,26 30,6 23,20" fill="#F5C140"/>
      <polygon points="33,24 29,10 25,20" fill="#F0A0A0" opacity="0.75"/>
      {/* 얼굴 */}
      <ellipse cx="22" cy="28" rx="15" ry="13" fill="#F5C140"/>
      {/* 왼쪽 눈 */}
      <circle cx="16.5" cy="25.5" r="2.8" fill="#1a1a1a"/>
      <circle cx="17.3" cy="24.6" r="1" fill="white"/>
      {/* 오른쪽 눈 */}
      <circle cx="27.5" cy="25.5" r="2.8" fill="#1a1a1a"/>
      <circle cx="28.3" cy="24.6" r="1" fill="white"/>
      {/* 코 */}
      <ellipse cx="22" cy="31" rx="3.2" ry="2.2" fill="#2a2020"/>
      <ellipse cx="21" cy="30.2" rx="1" ry="0.6" fill="rgba(255,255,255,0.25)"/>
      {/* 입 */}
      <path d="M18.5,34 Q22,37.5 25.5,34" stroke="#2a2020" strokeWidth="1.4" fill="none" strokeLinecap="round"/>
      {/* 볼 터치 */}
      <circle cx="12.5" cy="30" r="4" fill="#F08060" opacity="0.35"/>
      <circle cx="31.5" cy="30" r="4" fill="#F08060" opacity="0.35"/>
    </svg>
  );
}

export default function App() {
  const [mode, setMode] = useState(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("mode") === "rolling") return "rolling";
    if (p.get("mode") === "sensitivity") return "sensitivity";
    if (p.get("mode") === "scan") return "scan";
    if (p.get("mode") === "cycle") return "cycle";
    if (p.get("mode") === "compare") return "compare";
    return "backtest"; // 기본 페이지
  });
  const headerRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [params, setParams] = useState(null);
  const [rawPrices, setRawPrices] = useState(null); // 롤링 분석용 원본 가격 데이터

  useEffect(() => {
    // React state 대신 DOM 직접 조작 → 스크롤 중 리렌더링 없음
    const onScroll = () => {
      headerRef.current?.classList.toggle("header-scrolled", window.scrollY > 30);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

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
      <header className="header" ref={headerRef}>
        <div className="header-inner">
          <div className="header-top">
            <div className="logo" onClick={() => setMode("guide")} title="전략 가이드" style={{ cursor: "pointer" }}>
              <div className="logo-icon"><DogLogo /></div>
              <div className="logo-text">
                <div className="logo-title">황구</div>
                <div className="logo-sub">Backtest Engine</div>
              </div>
            </div>
            <nav className="main-nav">
              <button className={`nav-btn ${mode === "backtest" ? "nav-active" : ""}`} onClick={() => setMode("backtest")}>백테스트</button>
              <button className={`nav-btn ${mode === "rolling" ? "nav-active" : ""}`} onClick={() => setMode("rolling")}>롤링 분석</button>
              <button className={`nav-btn ${mode === "sensitivity" ? "nav-active" : ""}`} onClick={() => setMode("sensitivity")}>민감도 분석</button>
              <button className={`nav-btn ${mode === "scan" ? "nav-active" : ""}`} onClick={() => setMode("scan")}>종목 스캔</button>
              <button className={`nav-btn ${mode === "cycle" ? "nav-active" : ""}`} onClick={() => setMode("cycle")}>사이클 분석</button>
              <button className={`nav-btn ${mode === "compare" ? "nav-active" : ""}`} onClick={() => setMode("compare")}>vs QLD</button>
            </nav>
          </div>
        </div>
      </header>

      <main className="main">
        {mode === "guide" && <GuidePage onBack={() => setMode("backtest")} />}
        {mode === "scan" && <ScanPage />}
        {mode === "cycle" && <CyclePage />}
        {mode === "rolling" && <RollingPage prices={rawPrices} params={params} onGoBacktest={() => setMode("backtest")} />}
        {mode === "sensitivity" && <SensitivityPage />}
        {mode === "compare" && <QldComparePage />}

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
                <Summary summary={result.summary} params={params} dailyLog={result.dailyLog} />
                <Charts dailyLog={result.dailyLog} cycles={result.cycles} symbol={params.symbol} symbolName={params.symbolName} maxPorang={params.porang} />
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
