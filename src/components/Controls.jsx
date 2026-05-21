import { useState } from "react";

const POPULAR = ["SOXL", "AAPL", "TSLA", "NVDA", "SPY", "QQQ", "TQQQ"];
const STORAGE_KEY = "yd_controls";

const getDefaultDates = () => {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const year = today.getMonth() === 0 ? today.getFullYear() - 1 : today.getFullYear();
  return {
    from: `${year}-01-01`,
    to: yesterday.toISOString().split('T')[0],
  };
};

const loadSaved = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
};

const saveValues = (values) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
  } catch {}
};

export default function Controls({ onRun, loading }) {
  const { from: defaultFrom, to: defaultTo } = getDefaultDates();
  const saved = loadSaved();

  const [symbol, setSymbol] = useState(saved?.symbol ?? "SOXL");
  const [from, setFrom] = useState(saved?.from ?? defaultFrom);
  const [to, setTo] = useState(saved?.to ?? defaultTo);
  const [investment, setInvestment] = useState(saved?.investment ?? 15000);

  const update = (field, value) => {
    const next = { symbol, from, to, investment, [field]: value };
    saveValues(next);
    if (field === "symbol") setSymbol(value);
    if (field === "from") setFrom(value);
    if (field === "to") setTo(value);
    if (field === "investment") setInvestment(value);
  };

  function handleSubmit(e) {
    e.preventDefault();
    if (!symbol || !from || !to || !investment) return;
    onRun({ symbol: symbol.toUpperCase(), from, to, investment: Number(investment) });
  }

  return (
    <section className="controls-section">
      <h2 className="section-title">시뮬레이션 설정</h2>
      <form className="controls-form" onSubmit={handleSubmit}>
        <div className="control-group">
          <label>종목 (티커)</label>
          <input
            className="input"
            value={symbol}
            onChange={e => update("symbol", e.target.value.toUpperCase())}
            placeholder="예: SOXL"
            required
          />
          <div className="quick-symbols">
            {POPULAR.map(s => (
              <button
                key={s}
                type="button"
                className={`chip ${symbol === s ? "chip-active" : ""}`}
                onClick={() => update("symbol", s)}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="control-row">
          <div className="control-group">
            <label>시작일</label>
            <input
              className="input"
              type="date"
              value={from}
              onChange={e => update("from", e.target.value)}
              required
            />
          </div>
          <div className="control-group">
            <label>종료일</label>
            <input
              className="input"
              type="date"
              value={to}
              onChange={e => update("to", e.target.value)}
              required
            />
          </div>
        </div>

        <div className="control-group">
          <label>투자금 (USD)</label>
          <div className="input-prefix-wrap">
            <span className="input-prefix">$</span>
            <input
              className="input input-prefixed"
              type="number"
              value={investment}
              onChange={e => update("investment", e.target.value)}
              min={1500}
              step={100}
              required
            />
          </div>
          <div className="hint">1회 매수금액: ${(investment / 15).toFixed(0)}</div>
        </div>

        <button className="run-btn" type="submit" disabled={loading}>
          {loading ? "시뮬레이션 중..." : "▶ 백테스트 실행"}
        </button>
      </form>
    </section>
  );
}
