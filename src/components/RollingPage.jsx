import { useState } from "react";
import { fetchPrices } from "../utils/stockCache";
import RollingChart from "./RollingChart";

const DEFAULT_USD = 15000;
const DEFAULT_KRW = 15000000;
const isKoreanSymbol = (sym) => sym?.endsWith(".KS");

const toKSTDateStr = (d) => new Date(d.getTime() + 9 * 60 * 60 * 1000).toISOString().split("T")[0];
const todayKST = () => toKSTDateStr(new Date());

const PERIODS = [
  { label: "1개월", months: 1 },
  { label: "3개월", months: 3 },
  { label: "6개월", months: 6 },
  { label: "1년",   years: 1 },
  { label: "2년",   years: 2 },
  { label: "3년",   years: 3 },
  { label: "5년",   years: 5 },
  { label: "10년",  years: 10 },
];

const EVENTS = [
  { label: "2018 무역전쟁",     from: "2018-10-01", to: "2018-12-31", type: "crash" },
  { label: "COVID 폭락",        from: "2020-02-20", to: "2020-03-18", type: "crash" },
  { label: "2022 금리인상 폭락", from: "2021-11-01", to: "2022-10-31", type: "crash" },
  { label: "엔캐리 청산",        from: "2024-07-10", to: "2024-08-05", type: "crash" },
  { label: "관세전쟁",           from: "2025-02-18", to: "2025-04-07", type: "crash" },
  { label: "COVID 반등",         from: "2020-03-18", to: "2021-11-22", type: "rally" },
  { label: "AI 반등",            from: "2022-10-13", to: "2023-07-31", type: "rally" },
  { label: "AI 랠리",            from: "2024-04-19", to: "2024-06-18", type: "rally" },
  { label: "트럼프 당선 랠리",   from: "2024-11-05", to: "2024-11-25", type: "rally" },
];

function getPeriodDates(p) {
  const to = new Date();
  const from = new Date(to);
  if (p.months) from.setMonth(from.getMonth() - p.months);
  if (p.years)  from.setFullYear(from.getFullYear() - p.years);
  return { from: toKSTDateStr(from), to: toKSTDateStr(to) };
}

const getDefaultFrom = () => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 3);
  return toKSTDateStr(d);
};
const getDefaultTo = () => todayKST();

export default function RollingPage({ prices: backtestPrices, params: backtestParams }) {
  // 백테스트 실행 이력이 있으면 그 설정을 초기값으로 사용, 없으면 기본값
  const [symbol, setSymbol] = useState(backtestParams?.symbol || "SOXL");
  const [from, setFrom] = useState(backtestParams?.from || getDefaultFrom());
  const [to, setTo] = useState(backtestParams?.to || getDefaultTo());
  const [investment, setInvestment] = useState(String(backtestParams?.investment || DEFAULT_USD));
  const [porang, setPorang] = useState(String(backtestParams?.porang || 15));

  const [prices, setPrices] = useState(backtestPrices || null);
  const [ranParams, setRanParams] = useState(backtestParams || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const prefix = isKoreanSymbol(symbol) ? "₩" : "$";

  async function handleRun() {
    if (!symbol || !from || !to) return;
    setLoading(true);
    setError(null);
    try {
      // 첫날 LP 계산을 위한 7일 lookback
      const lb = new Date(from);
      lb.setDate(lb.getDate() - 7);
      const data = await fetchPrices(symbol.toUpperCase(), lb.toISOString().split("T")[0], to);
      if (data.prices.length < 5) throw new Error("해당 기간 데이터가 부족합니다.");
      setPrices(data.prices);
      setRanParams({
        symbol: symbol.toUpperCase(),
        from,
        to,
        investment: Number(investment) || DEFAULT_USD,
        porang: Math.max(1, Math.min(30, Number(porang) || 15)),
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rolling-page">
      <div className="section-title">
        롤링 분석
        <span className="section-sub">종료일 고정 · 시작일을 밀어가며 진입 시점 민감도 분석</span>
      </div>

      {/* 설정 폼 */}
      <div className="rolling-form">
        {/* 이벤트 기간 */}
        <div className="event-chips">
          {EVENTS.map(e => (
            <button key={e.label}
              className={`chip event-chip event-chip-${e.type}`}
              onClick={() => { setFrom(e.from); setTo(e.to); }}>
              {e.label}
            </button>
          ))}
        </div>
        {/* 기간 빠른 선택 */}
        <div className="rolling-form-periods">
          {PERIODS.map(p => (
            <button key={p.label}
              className="chip"
              onClick={() => { const d = getPeriodDates(p); setFrom(d.from); setTo(d.to); }}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="rolling-form-row">
          <div className="rolling-form-field">
            <label className="rolling-form-label">종목</label>
            <input className="input" value={symbol}
              onChange={e => setSymbol(e.target.value.toUpperCase())}
              placeholder="예: SOXL" style={{ width: 110 }} />
          </div>
          <div className="rolling-form-field">
            <label className="rolling-form-label">시작일</label>
            <input className="input input-compact" type="date" value={from}
              onChange={e => setFrom(e.target.value)} />
          </div>
          <div className="rolling-form-field">
            <label className="rolling-form-label">종료일</label>
            <input className="input input-compact" type="date" value={to}
              onChange={e => setTo(e.target.value)} />
          </div>
          <div className="rolling-form-field">
            <label className="rolling-form-label">투자금 ({isKoreanSymbol(symbol) ? "KRW" : "USD"})</label>
            <div className="input-prefix-wrap">
              <span className="input-prefix">{prefix}</span>
              <input className="input input-prefixed" type="number" value={investment}
                onChange={e => setInvestment(e.target.value)}
                style={{ width: 120 }} />
            </div>
          </div>
          <div className="rolling-form-field">
            <label className="rolling-form-label">분할</label>
            <input className="input porang-input" type="number" value={porang}
              onChange={e => setPorang(e.target.value)} min={1} max={30} />
          </div>
          <button className="run-btn" onClick={handleRun} disabled={loading}>
            {loading ? "로딩 중..." : "▶ 분석 실행"}
          </button>
        </div>
        {error && (
          <div className="error-box"><span className="error-icon">⚠</span> {error}</div>
        )}
      </div>

      {/* 결과 */}
      {prices && ranParams && (
        <RollingChart
          prices={prices}
          investment={ranParams.investment}
          maxPorang={ranParams.porang}
          from={ranParams.from}
          to={ranParams.to}
        />
      )}

      {!prices && (
        <div className="rolling-empty" style={{ marginTop: 40 }}>
          설정을 입력하고 분석을 실행하세요.
          {backtestParams && " (백테스트 설정이 자동으로 불러와졌습니다)"}
        </div>
      )}
    </section>
  );
}
