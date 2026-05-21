import { useState } from "react";

const POPULAR_US = ["SOXL", "AAPL", "TSLA", "NVDA", "SPY", "QQQ", "TQQQ"];

const POPULAR_KR = [
  { symbol: "122630.KS", label: "KODEX 레버리지" },
  { symbol: "409820.KS", label: "KODEX 미국나스닥100레버리지" },
  { symbol: "423920.KS", label: "TIGER 미국필라델피아반도체레버리지(합성)" },
  { symbol: "494310.KS", label: "KODEX 반도체레버리지" },
  { symbol: "488080.KS", label: "TIGER 반도체TOP10레버리지" },
];
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

const getInitialValues = () => {
  const { from: defaultFrom, to: defaultTo } = getDefaultDates();
  // URL 파라미터 우선, 없으면 localStorage, 없으면 기본값
  const params = new URLSearchParams(window.location.search);
  if (params.get("symbol")) {
    return {
      symbol: params.get("symbol"),
      from: params.get("from") ?? defaultFrom,
      to: params.get("to") ?? defaultTo,
      investment: Number(params.get("investment") ?? 15000),
      porang: Number(params.get("porang") ?? 15),
      fromUrl: true,
    };
  }
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return { ...JSON.parse(saved), fromUrl: false };
  } catch {}
  return { symbol: "SOXL", from: defaultFrom, to: defaultTo, investment: 15000, fromUrl: false };
};

const saveValues = (values) => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(values)); } catch {}
};

export default function Controls({ onRun, loading }) {
  const initial = getInitialValues();
  const [symbol, setSymbol] = useState(initial.symbol);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [investment, setInvestment] = useState(initial.investment);
  const [porang, setPorang] = useState(initial.porang ?? 15);
  const [copied, setCopied] = useState(false);

  // URL 파라미터로 열린 경우 자동 실행 (최초 1회)
  const [autoRan, setAutoRan] = useState(false);
  if (initial.fromUrl && !autoRan && !loading) {
    setAutoRan(true);
    setTimeout(() => onRun({ symbol: initial.symbol, from: initial.from, to: initial.to, investment: initial.investment, porang: initial.porang ?? 15 }), 0);
  }

  const update = (field, value) => {
    const next = { symbol, from, to, investment, [field]: value };
    saveValues(next);
    if (field === "symbol") setSymbol(value);
    if (field === "from") setFrom(value);
    if (field === "to") setTo(value);
    if (field === "investment") setInvestment(value);
    if (field === "porang") setPorang(value);
  };

  const copyLink = () => {
    const params = new URLSearchParams({ symbol, from, to, investment, porang });
    const url = `${window.location.origin}${window.location.pathname}?${params}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  function handleSubmit(e) {
    e.preventDefault();
    if (!symbol || !from || !to || !investment) return;
    onRun({ symbol: symbol.toUpperCase(), from, to, investment: Number(investment), porang: Number(porang) });
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
            {POPULAR_US.map(s => (
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
          <div className="quick-symbols">
            <span className="symbol-group-label">🇰🇷 국내 ETF</span>
            {POPULAR_KR.map(({ symbol: s, label }) => (
              <button
                key={s}
                type="button"
                className={`chip chip-kr ${symbol === s ? "chip-active" : ""}`}
                onClick={() => update("symbol", s)}
                title={s}
              >
                {label}
              </button>
            ))}
          </div>
          <span className="hint">한국 ETF 직접 입력 시 종목코드 뒤에 .KS를 붙이세요 (예: 423920.KS)</span>
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
          <div className="investment-row">
            <div className="control-group" style={{ flex: 1 }}>
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
            </div>
            <div className="control-group control-group-narrow">
              <label>분할 수 (포랭)</label>
              <input
                className="input"
                type="number"
                value={porang}
                onChange={e => update("porang", Math.max(1, Math.min(30, Number(e.target.value))))}
                min={1}
                max={30}
                required
              />
            </div>
          </div>
          <div className="hint">1회 매수금액: ${Math.floor(investment / porang).toLocaleString()}</div>
        </div>

        <div className="controls-actions">
          <button className="run-btn" type="submit" disabled={loading}>
            {loading ? "시뮬레이션 중..." : "▶ 백테스트 실행"}
          </button>
          <button className="share-btn" type="button" onClick={copyLink}>
            {copied ? "✓ 복사됨" : "🔗 링크 복사"}
          </button>
        </div>
      </form>
    </section>
  );
}
