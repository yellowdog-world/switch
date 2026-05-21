import { useState, useRef } from "react";
import { fetchPrices } from "../utils/stockCache";
import { runBacktest } from "../engine/switchEngine";
import { SCAN_LISTS } from "../data/scanTickers";

const PERIODS = [
  { key: "3m", label: "3개월" },
  { key: "6m", label: "6개월" },
  { key: "1y", label: "1년" },
  { key: "3y", label: "3년" },
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
  if (key === "3y") from.setFullYear(from.getFullYear() - 3);
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

export default function ScanPage() {
  const [period, setPeriod] = useState("1y");
  const [categories, setCategories] = useState(["us3x"]);
  const [investment, setInvestment] = useState(15000);
  const [porang, setPorang] = useState(15);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState([]);
  const [failCount, setFailCount] = useState(0);
  const abortRef = useRef(false);

  async function runScan() {
    abortRef.current = false;
    const tickers = [...new Set(categories.flatMap(c => SCAN_LISTS[c].tickers))];
    setScanning(true);
    setResults([]);
    setFailCount(0);
    setProgress({ done: 0, total: tickers.length });

    const { from, to } = getPeriodDates(period);
    const collected = [];
    let fails = 0;

    const BATCH = 5;
    for (let i = 0; i < tickers.length; i += BATCH) {
      if (abortRef.current) break;
      const batch = tickers.slice(i, i + BATCH);
      const settled = await Promise.allSettled(
        batch.map(sym => scanOne(sym, from, to, investment, porang))
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

  return (
    <section className="scan-section">
      <div className="section-title">
        종목 스캔
        <span className="section-sub">동일 조건으로 일괄 백테스트 후 수익률 순위 비교</span>
      </div>

      <div className="scan-controls">
        <div className="scan-control-group">
          <span className="scan-label">기간</span>
          <div className="scan-chips">
            {PERIODS.map(p => (
              <button key={p.key} className={`chip ${period === p.key ? "chip-active" : ""}`}
                onClick={() => setPeriod(p.key)} disabled={scanning}>{p.label}</button>
            ))}
          </div>
        </div>

        <div className="scan-control-group">
          <span className="scan-label">카테고리</span>
          <div className="scan-chips">
            {Object.entries(SCAN_LISTS).map(([key, val]) => (
              <button key={key}
                className={`chip ${categories.includes(key) ? "chip-active" : ""}`}
                onClick={() => setCategories(prev =>
                  prev.includes(key)
                    ? prev.length > 1 ? prev.filter(c => c !== key) : prev
                    : [...prev, key]
                )}
                disabled={scanning}>{val.label}</button>
            ))}
          </div>
        </div>

        <div className="scan-control-group">
          <span className="scan-label">투자금 / 분할</span>
          <div className="investment-row">
            <div className="input-prefix-wrap" style={{ flex: 1 }}>
              <span className="input-prefix">$</span>
              <input className="input input-prefixed" type="number" value={investment}
                onChange={e => setInvestment(Number(e.target.value))}
                min={1500} step={100} disabled={scanning} />
            </div>
            <span className="investment-divider">÷</span>
            <input className="input porang-input" type="number" value={porang}
              onChange={e => setPorang(Math.max(1, Math.min(30, Number(e.target.value))))}
              min={1} max={30} disabled={scanning} />
            <span className="investment-unit">분할</span>
          </div>
          <span className="hint">1회 매수금액: ${Math.floor(investment / porang).toLocaleString()}</span>
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
                  <td><span className="scan-symbol">{r.symbol}</span></td>
                  <td className="scan-name">{r.symbolName}</td>
                  <td className={r.totalReturn >= 0 ? "val-green" : "val-red"}>
                    {r.totalReturn >= 0 ? "+" : ""}{r.totalReturn.toFixed(2)}%
                  </td>
                  <td>${r.finalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
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
