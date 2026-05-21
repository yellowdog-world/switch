import { useState } from "react";

//const POPULAR = ["AAPL", "TSLA", "NVDA", "SPY", "QQQ", "MSFT", "AMZN"];
const POPULAR = ["SOXL", "AAPL", "TSLA", "NVDA", "SPY", "QQQ", "TQQQ"];

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

export default function Controls({ onRun, loading }) {
  const { from: defaultFrom, to: defaultTo } = getDefaultDates();
  const [symbol, setSymbol] = useState("SOXL");
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);

export default function Controls({ onRun, loading }) {
  const [symbol, setSymbol] = useState("AAPL");
  const [from, setFrom] = useState("2022-01-01");
  const [to, setTo] = useState("2024-12-31");
  const [investment, setInvestment] = useState(15000);

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
            onChange={e => setSymbol(e.target.value.toUpperCase())}
            placeholder="예: AAPL"
            required
          />
          <div className="quick-symbols">
            {POPULAR.map(s => (
              <button
                key={s}
                type="button"
                className={`chip ${symbol === s ? "chip-active" : ""}`}
                onClick={() => setSymbol(s)}
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
              onChange={e => setFrom(e.target.value)}
              required
            />
          </div>
          <div className="control-group">
            <label>종료일</label>
            <input
              className="input"
              type="date"
              value={to}
              onChange={e => setTo(e.target.value)}
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
              onChange={e => setInvestment(e.target.value)}
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
