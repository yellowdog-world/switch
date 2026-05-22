import { useState, useRef, useCallback } from "react";
import { fetchPrices } from "../utils/stockCache";
import { runBacktest } from "../engine/switchEngine";
import { SCAN_LISTS } from "../data/scanTickers";

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

function getPeriodDates(key) {
  const to = new Date();
  const from = new Date(to);
  if (key === "3m") from.setMonth(from.getMonth() - 3);
  if (key === "6m") from.setMonth(from.getMonth() - 6);
  if (key === "1y") from.setFullYear(from.getFullYear() - 1);
  if (key === "2y") from.setFullYear(from.getFullYear() - 2);
  if (key === "3y") from.setFullYear(from.getFullYear() - 3);
  if (key === "5y") from.setFullYear(from.getFullYear() - 5);
  if (key === "10y") from.setFullYear(from.getFullYear() - 10);
  return { from: toKSTDateStr(from), to: toKSTDateStr(to) };
}

async function scanOne(symbol, from, to, investment, porang) {
  const lb = new Date(from);
  lb.setDate(lb.getDate() - 7);
  const data = await fetchPrices(symbol, lb.toISOString().split("T")[0], to);
  if (data.prices.length < 2) return null;
  const result = runBacktest(data.prices, investment, from, porang);
  return { symbol, symbolName: data.symbolName || symbol, ...result.summary };
}

const DEFAULT_USD = 15000;
const DEFAULT_KRW = 15000000;
const isKoreanOnly = (cats) => cats.length > 0 && cats.every(c => c === "kr");
const defaultInvestmentFor = (cats) => isKoreanOnly(cats) ? DEFAULT_KRW : DEFAULT_USD;

const getInitialParams = () => {
  const p = new URLSearchParams(window.location.search);
  if (p.get("mode") === "scan" || !p.get("mode")) {
    const cats = p.get("categories") ? p.get("categories").split(",") : ["us3x"];
    const periodKey = p.get("period") || "1y";
    const defaultDates = getPeriodDates(periodKey);
    return {
      period: periodKey,
      from: p.get("from") || defaultDates.from,
      to: p.get("to") || defaultDates.to,
      categories: cats,
      investment: Number(p.get("investment") || defaultInvestmentFor(cats)),
      porang: Number(p.get("porang") || 15),
    };
  }
  const defaultDates = getPeriodDates("1y");
  return { period: "1y", ...defaultDates, categories: ["us3x"], investment: DEFAULT_USD, porang: 15 };
};

export default function ScanPage() {
  const init = getInitialParams();
  const [period, setPeriod] = useState(init.period);
  const [from, setFrom] = useState(init.from);
  const [to, setTo] = useState(init.to);
  const [categories, setCategories] = useState(init.categories);
  const [investment, setInvestment] = useState(String(init.investment));
  const [porang, setPorang] = useState(init.porang);
  const [scanning, setScanning] = useState(false);
  const [copied, setCopied] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState([]);
  const [failCount, setFailCount] = useState(0);
  const abortRef = useRef(false);

  function applyPeriod(key) {
    const { from: f, to: t } = getPeriodDates(key);
    setPeriod(key);
    setFrom(f);
    setTo(t);
  }

  async function runScan() {
    abortRef.current = false;
    const tickers = [...new Set(categories.flatMap(c => SCAN_LISTS[c].tickers))];
    setScanning(true);
    setResults([]);
    setFailCount(0);
    setProgress({ done: 0, total: tickers.length });
    const collected = [];
    let fails = 0;

    const BATCH = 5;
    for (let i = 0; i < tickers.length; i += BATCH) {
      if (abortRef.current) break;
      const batch = tickers.slice(i, i + BATCH);
      const settled = await Promise.allSettled(
        batch.map(sym => scanOne(sym, from, to, Number(investment) || 0, porang))
      );
      for (const r of settled) {
        if (r.status === "fulfilled" && r.value) {
          collected.push(r.value);
          collected.sort((a, b) => b.totalReturn - a.totalReturn);
          setResults([...collected]);
        } else {
          fails++;
          setFailCount(fails);
        }
        setProgress(prev => ({ ...prev, done: prev.done + 1 }));
      }
    }
    setScanning(false);
  }

  const tickers = [...new Set(categories.flatMap(c => SCAN_LISTS[c].tickers))];
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  const hasKR = categories.includes("kr");
  const hasUS = categories.some(c => c !== "kr");
  const scanPrefix = hasKR && hasUS ? "" : hasKR ? "₩" : "$";

  function copyLink() {
    const params = new URLSearchParams({ mode: "scan", period, from, to, categories: categories.join(","), investment, porang });
    const url = `${window.location.origin}${window.location.pathname}?${params}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <section className="scan-section">
      <div className="section-title">
        종목 스캔
        <span className="section-sub">동일 조건으로 일괄 백테스트 후 수익률 순위 비교</span>
      </div>

      <div className="scan-controls">
        <div className="scan-control-group">
          <span className="scan-label">기간</span>
          <div className="date-period-row">
            <div className="date-field">
              <span className="date-field-label">시작일</span>
              <input className="input input-compact" type="date" value={from}
                onChange={e => { setFrom(e.target.value); setPeriod(""); }} disabled={scanning} />
            </div>
            <div className="date-field">
              <span className="date-field-label">종료일</span>
              <input className="input input-compact" type="date" value={to}
                onChange={e => { setTo(e.target.value); setPeriod(""); }} disabled={scanning} />
            </div>
            <div className="period-divider" />
            <div className="period-chips-inline">
              {PERIODS.map(p => (
                <button key={p.key} className={`chip ${period === p.key ? "chip-active" : ""}`}
                  onClick={() => applyPeriod(p.key)} disabled={scanning}>{p.label}</button>
              ))}
            </div>
          </div>
        </div>

        <div className="scan-control-group">
          <span className="scan-label">카테고리</span>
          <div className="scan-chips">
            {Object.entries(SCAN_LISTS).map(([key, val]) => (
              <button key={key}
                className={`chip ${categories.includes(key) ? "chip-active" : ""}`}
                onClick={() => {
                  setCategories(prev => {
                    const next = prev.includes(key)
                      ? prev.length > 1 ? prev.filter(c => c !== key) : prev
                      : [...prev, key];
                    if (isKoreanOnly(next)) setInvestment(String(DEFAULT_KRW));
                    else if (isKoreanOnly(prev)) setInvestment(String(DEFAULT_USD));
                    return next;
                  });
                }}
                disabled={scanning}>{val.label}</button>
            ))}
          </div>
        </div>

        <div className="scan-control-group">
          <span className="scan-label">투자금 / 분할</span>
          <div className="investment-row">
            {scanPrefix ? (
              <div className="input-prefix-wrap" style={{ flex: 1 }}>
                <span className="input-prefix">{scanPrefix}</span>
                <input className="input input-prefixed" type="number" value={investment}
                  onChange={e => setInvestment(e.target.value)}
                  min={hasKR && !hasUS ? 150000 : 1500}
                  step={hasKR && !hasUS ? 10000 : 100}
                  placeholder={hasKR && !hasUS ? "15000000" : "15000"}
                  disabled={scanning || isKoreanOnly(categories)} />
              </div>
            ) : (
              <input className="input" style={{ flex: 1 }} type="number" value={investment}
                onChange={e => setInvestment(e.target.value)}
                min={1500} step={100} placeholder="15000"
                disabled={scanning} />
            )}
            <span className="investment-divider">÷</span>
            <input className="input porang-input" type="number" value={porang}
              onChange={e => setPorang(Math.max(1, Math.min(30, Number(e.target.value))))}
              min={1} max={30} disabled={scanning} />
            <span className="investment-unit">분할</span>
          </div>
          <span className="hint">{scanPrefix}{investment ? Math.floor(Number(investment) / porang).toLocaleString() : "-"}</span>
        </div>

        <div className="scan-actions">
          {!scanning ? (
            <button className="run-btn" onClick={runScan}>
              스캔 시작 ({tickers.length}종목)
            </button>
          ) : (
            <button className="run-btn scan-stop-btn" onClick={() => abortRef.current = true}>
              중단
            </button>
          )}
          <button className="share-btn" onClick={copyLink}>
            {copied ? "✓ 복사됨" : "🔗 링크 복사"}
          </button>
        </div>
      </div>

      {(scanning || results.length > 0) && (
        <div className="scan-progress-wrap">
          <div className="scan-progress-bar">
            <div className="scan-progress-fill" style={{ width: `${pct}%` }} />
          </div>
          <span className="scan-progress-text">
            {progress.done} / {progress.total}
            {failCount > 0 && <span className="scan-fail-count"> ({failCount}개 데이터 없음)</span>}
          </span>
        </div>
      )}

      {results.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>종목코드</th>
                <th>종목명</th>
                <th>총수익률</th>
                <th>최종평가액</th>
                <th>MDD</th>
                <th>사이클</th>
                <th>똥이월</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={r.symbol} className={i === 0 ? "row-rank-top" : ""}>
                  <td className="scan-rank">{i + 1}</td>
                  <td>
                    <a
                      className="scan-symbol"
                      href={r.symbol.endsWith(".KS")
                        ? `https://finance.naver.com/item/main.naver?code=${r.symbol.replace(".KS", "")}`
                        : `https://finance.yahoo.com/quote/${r.symbol}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {r.symbol}
                    </a>
                  </td>
                  <td className="scan-name" title={r.symbolName}>{r.symbolName}</td>
                  <td className={r.totalReturn >= 0 ? "val-green" : "val-red"}>
                    {r.totalReturn >= 0 ? "+" : ""}{r.totalReturn.toFixed(2)}%
                  </td>
                  <td>{r.symbol.endsWith(".KS") ? "₩" : "$"}{r.finalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                  <td className="val-red">-{r.maxDrawdown.toFixed(2)}%</td>
                  <td>{r.totalCycles}</td>
                  <td className={r.dongCount > 0 ? "val-warn" : ""}>{r.dongCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
