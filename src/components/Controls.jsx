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

const PERIODS = [
  { key: "3m", label: "3개월" },
  { key: "6m", label: "6개월" },
  { key: "1y", label: "1년" },
  { key: "2y", label: "2년" },
  { key: "3y", label: "3년" },
  { key: "5y", label: "5년" },
  { key: "10y", label: "10년" },
];

const toKSTDateStr = (date) => {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().split("T")[0];
};

const getDefaultDates = () => {
  const today = new Date();
  const todayKST = toKSTDateStr(today);
  const year = today.getMonth() === 0 ? today.getFullYear() - 1 : today.getFullYear();
  return {
    from: `${year}-01-01`,
    to: todayKST,
  };
};

const calcPeriodDates = (key) => {
  const to = new Date();
  const toStr = toKSTDateStr(to);
  const from = new Date(to);
  if (key === "3m") from.setMonth(from.getMonth() - 3);
  if (key === "6m") from.setMonth(from.getMonth() - 6);
  if (key === "1y") from.setFullYear(from.getFullYear() - 1);
  if (key === "2y") from.setFullYear(from.getFullYear() - 2);
  if (key === "3y") from.setFullYear(from.getFullYear() - 3);
  if (key === "5y") from.setFullYear(from.getFullYear() - 5);
  if (key === "10y") from.setFullYear(from.getFullYear() - 10);
  return { from: toKSTDateStr(from), to: toStr };
};

const DEFAULT_USD = 15000;
const DEFAULT_KRW = 15000000;
const isKoreanSymbol = (sym) => sym.endsWith(".KS");
const defaultInvestmentFor = (sym) => isKoreanSymbol(sym) ? DEFAULT_KRW : DEFAULT_USD;

const getInitialValues = () => {
  const { from: defaultFrom, to: defaultTo } = getDefaultDates();
  // URL 파라미터 우선, 없으면 localStorage, 없으면 기본값
  const params = new URLSearchParams(window.location.search);
  if (params.get("symbol")) {
    const sym = params.get("symbol");
    return {
      symbol: sym,
      from: params.get("from") ?? defaultFrom,
      to: params.get("to") ?? defaultTo,
      investment: Number(params.get("investment") ?? defaultInvestmentFor(sym)),
      porang: Number(params.get("porang") ?? 15),
      fromUrl: true,
    };
  }
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return { ...JSON.parse(saved), fromUrl: false };
  } catch {}
  return { symbol: "SOXL", from: defaultFrom, to: defaultTo, investment: DEFAULT_USD, fromUrl: false };
};

const saveValues = (values) => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(values)); } catch {}
};

export default function Controls({ onRun, loading }) {
  const initial = getInitialValues();
  const [symbol, setSymbol] = useState(initial.symbol);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [activePeriod, setActivePeriod] = useState("");
  // investment/porang을 string으로 관리하는 이유:
  // Number 상태면 빈 칸을 지웠을 때 Number("") = 0이 되어 "0"이 남음.
  // string으로 두면 완전히 비워진 상태를 유지할 수 있음.
  const [investment, setInvestment] = useState(String(initial.investment));
  const [porang, setPorang] = useState(String(initial.porang ?? 15));
  const [copied, setCopied] = useState(false);

  // URL 파라미터로 열린 경우 자동 실행 (최초 1회)
  const [autoRan, setAutoRan] = useState(false);
  if (initial.fromUrl && !autoRan && !loading) {
    setAutoRan(true);
    setTimeout(() => onRun({ symbol: initial.symbol, from: initial.from, to: initial.to, investment: initial.investment, porang: initial.porang ?? 15 }), 0);
  }

  const update = (field, value) => {
    let nextInvestment = investment;
    if (field === "symbol") {
      const wasKorean = isKoreanSymbol(symbol);
      const willBeKorean = isKoreanSymbol(value);
      if (wasKorean !== willBeKorean) {
        // 종목 변경 시 통화가 바뀌면(USD↔KRW) 투자금 기본값도 자동 전환.
        // 단, 사용자가 직접 바꾼 값은 건드리지 않고 기본값 그대로인 경우만 전환.
        const prevDefault = String(wasKorean ? DEFAULT_KRW : DEFAULT_USD);
        if (investment === prevDefault) nextInvestment = String(willBeKorean ? DEFAULT_KRW : DEFAULT_USD);
      }
    }
    const next = { symbol, from, to, investment: Number(nextInvestment) || 0, porang, [field]: value };
    if (field !== "investment") next.investment = Number(nextInvestment) || 0;
    saveValues(next);
    if (field === "symbol") { setSymbol(value); if (nextInvestment !== investment) setInvestment(nextInvestment); }
    if (field === "from") setFrom(value);
    if (field === "to") setTo(value);
    if (field === "investment") setInvestment(value);
    if (field === "porang") setPorang(value);
  };

  const applyPeriod = (key) => {
    const { from: f, to: t } = calcPeriodDates(key);
    const next = { symbol, from: f, to: t, investment, porang };
    saveValues(next);
    setFrom(f);
    setTo(t);
    setActivePeriod(key);
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
    if (!symbol || !from || !to || !investment || !porang) return;
    const p = Math.max(1, Math.min(30, Number(porang)));
    onRun({ symbol: symbol.toUpperCase(), from, to, investment: Number(investment), porang: p });
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

        <div className="control-group">
          <label>기간</label>
          <div className="date-period-row">
            <div className="date-field">
              <span className="date-field-label">시작일</span>
              <input className="input input-compact" type="date" value={from}
                onChange={e => { update("from", e.target.value); setActivePeriod(""); }} required />
            </div>
            <div className="date-field">
              <span className="date-field-label">종료일</span>
              <input className="input input-compact" type="date" value={to}
                onChange={e => { update("to", e.target.value); setActivePeriod(""); }} required />
            </div>
            <div className="period-divider" />
            <div className="period-chips-inline">
              {PERIODS.map(p => (
                <button key={p.key} type="button"
                  className={`chip ${activePeriod === p.key ? "chip-active" : ""}`}
                  onClick={() => applyPeriod(p.key)}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="control-group">
          <label>투자금 ({isKoreanSymbol(symbol) ? "KRW" : "USD"})</label>
          <div className="investment-row">
            <div className="input-prefix-wrap" style={{ flex: 1 }}>
              <span className="input-prefix">{isKoreanSymbol(symbol) ? "₩" : "$"}</span>
              <input
                className="input input-prefixed"
                type="number"
                value={investment}
                onChange={e => update("investment", e.target.value)}
                min={isKoreanSymbol(symbol) ? 150000 : 1500}
                step={isKoreanSymbol(symbol) ? 10000 : 100}
                placeholder={isKoreanSymbol(symbol) ? "15000000" : "15000"}
                required
              />
            </div>
            <span className="investment-divider">÷</span>
            <input
              className="input porang-input"
              type="number"
              value={porang}
              onChange={e => update("porang", e.target.value)}
              min={1}
              max={30}
              required
              title="분할 수 (포랭)"
            />
            <span className="investment-unit">분할</span>
          </div>
          <div className="hint">1회 매수금액: {isKoreanSymbol(symbol) ? "₩" : "$"}{investment && porang ? Math.floor(Number(investment) / Number(porang)).toLocaleString() : "-"}</div>
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
