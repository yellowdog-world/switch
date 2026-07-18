import { useState } from "react";
import { fetchPrices } from "../utils/stockCache";
import { runBacktest } from "../engine/switchEngine";

const DEFAULT_USD = 15000;
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

function getPeriodDates(p) {
  const to = new Date();
  const from = new Date(to);
  if (p.months) from.setMonth(from.getMonth() - p.months);
  if (p.years)  from.setFullYear(from.getFullYear() - p.years);
  return { from: toKSTDateStr(from), to: toKSTDateStr(to) };
}

function getDefaultFrom() {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 3);
  return toKSTDateStr(d);
}

const PORANG_SWEEP = [8, 10, 12, 15, 18, 20, 30];

// 시작일을 stepDays씩 밀며 롤링 백테스트 → 승률(%) 반환
function computeRollingWinRate(priceData, from, porang, buyRate, opts = {}, stepDays = 14) {
  const wins = [], end = priceData[priceData.length - 1]?.date;
  const cur = new Date(from);
  while (true) {
    const startStr = cur.toISOString().split("T")[0];
    if (startStr >= end) break;
    const remaining = priceData.filter(p => p.date >= startStr);
    if (remaining.length < 5) break;
    const s = runBacktest(priceData, 10000, startStr, porang, buyRate, opts).summary;
    wins.push(s.totalReturn > 0);
    cur.setDate(cur.getDate() + stepDays);
  }
  return wins.length ? Math.round((wins.filter(Boolean).length / wins.length) * 100) : null;
}
const BUYRATE_SWEEP = [0.001, 0.002, 0.003, 0.005];

// 매트릭스 내 최솟값~최댓값 기준 상대 색상
// 최고값 → 진한 초록, 최솟값 → 진한 빨강 (양수만 있으면 흐린 초록~진한 초록)
function heatColor(value, min, max) {
  if (max === min) return "rgba(52,211,153,0.4)";
  const ratio = (value - min) / (max - min); // 0=최솟값, 1=최댓값

  if (min >= 0) {
    // 전부 양수: 흐린 초록(최저) → 진한 초록(최고)
    const alpha = 0.10 + ratio * 0.78;
    return `rgba(52,211,153,${alpha.toFixed(2)})`;
  } else if (max <= 0) {
    // 전부 음수: 진한 빨강(최저) → 흐린 빨강(최고)
    const alpha = 0.88 - ratio * 0.78;
    return `rgba(248,113,113,${alpha.toFixed(2)})`;
  } else {
    // 혼합: 양수 → 초록, 음수 → 빨강, 0 근처 → 흐림
    if (value >= 0) {
      const alpha = 0.10 + (value / max) * 0.78;
      return `rgba(52,211,153,${alpha.toFixed(2)})`;
    } else {
      const alpha = 0.10 + (value / min) * 0.78;
      return `rgba(248,113,113,${alpha.toFixed(2)})`;
    }
  }
}

function fmtReturn(v) {
  if (v == null) return "-";
  return (v >= 0 ? "+" : "") + v.toFixed(1) + "%";
}

function MatrixTable({ matrix, basePorang, baseBuyRate }) {
  const allValues = matrix.flat().map(s => s.totalReturn);
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);

  return (
    <div className="sens-matrix-wrap">
      <table className="sens-matrix-table">
        <thead>
          <tr>
            <th className="sens-matrix-corner">분할 \ 매수배율</th>
            {BUYRATE_SWEEP.map(br => (
              <th key={br} className="sens-matrix-col-head">{(br * 100).toFixed(1)}%</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PORANG_SWEEP.map((p, pi) => (
            <tr key={p}>
              <td className="sens-matrix-row-head">{p}분할</td>
              {BUYRATE_SWEEP.map((br, bi) => {
                const s = matrix[pi][bi];
                const isCurrent = p === basePorang && Math.abs(br - baseBuyRate) < 0.00005;
                return (
                  <td key={br}
                    className={`sens-matrix-cell${isCurrent ? " sens-matrix-current" : ""}`}
                    style={{ background: heatColor(s.totalReturn, min, max) }}
                    title={`${p}분할 / ${(br * 100).toFixed(1)}% | 최대낙폭: -${s.maxDrawdown.toFixed(1)}% | 사이클: ${s.totalCycles}`}>
                    {isCurrent && <span className="sens-star">★ </span>}
                    {fmtReturn(s.totalReturn)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const CLEAN_LABEL = (s) => s.replace(/\s*\(현재\)/, "").replace(/\s*\(기준\)/, "").replace(/\s*\(엄격\)/, "").replace(/\s*\(관대\)/, "");

function BestSummary({ results }) {
  let bestMatrix = { totalReturn: -Infinity, porang: null, buyRate: null };
  PORANG_SWEEP.forEach((p, pi) => {
    BUYRATE_SWEEP.forEach((br, bi) => {
      const s = results.matrix[pi][bi];
      if (s.totalReturn > bestMatrix.totalReturn) bestMatrix = { totalReturn: s.totalReturn, porang: p, buyRate: br };
    });
  });

  const baseReturn = results.virtualBuyCompare[0].summary.totalReturn;
  const findBest = (arr) => arr.reduce((b, r) => r.summary.totalReturn > b.summary.totalReturn ? r : b);
  const rr = results.rollingRates;
  const rrKeys = ["matrix","virtualBuy","updownSell","tteobSell","tteobBuy","firstDay","splitWeight"];

  const rows = [
    {
      label: "분할수 × 매수배율",
      bestLabel: `${bestMatrix.porang}분할 / ${(bestMatrix.buyRate * 100).toFixed(2)}%`,
      currentLabel: `${results.basePorang}분할 / ${(results.baseBuyRate * 100).toFixed(2)}%`,
      bestVal: bestMatrix.totalReturn,
      currentVal: baseReturn,
      currentWR: rr?.matrix?.current,
      bestWR: rr?.matrix?.best,
    },
    ...["virtualBuyCompare","updownSellCompare","tteobSellCompare","tteobBuyCompare","firstDayCompare","splitWeightCompare"].map((key, i) => {
      const labels = ["샀다치고 변형","업다운 매도 조건","떨법 매도 조건","떨법 매수 지정가","첫날 급등 필터","분할 금액 구조"];
      const grp = results[key];
      const best = findBest(grp);
      const rrKey = rrKeys[i + 1];
      return {
        label: labels[i],
        bestLabel: CLEAN_LABEL(best.label),
        currentLabel: CLEAN_LABEL(grp[0].label),
        bestVal: best.summary.totalReturn,
        currentVal: grp[0].summary.totalReturn,
        currentWR: rr?.[rrKey]?.current,
        bestWR: rr?.[rrKey]?.best,
      };
    }),
  ];

  return (
    <div className="sens-best-card">
      <div className="sens-best-header">
        <span className="sens-best-title">수익률 기준 현재 vs 최적 설정</span>
      </div>
      <div className="sens-best-note">
        각 파라미터를 개별 비교한 결과. 수익률만으로 판단하지 말고 아래 표의 최대낙폭·사이클 수도 함께 확인하세요.<br />
        단일 백테스트에서 <strong style={{color:"rgba(255,255,255,0.75)"}}>차이가 10%p 미만이면 시작 시점 하나가 달라져도 결과가 뒤집힐 수 있어 노이즈 범위</strong>입니다. 차이가 유의미한지 확인하려면 롤링 분석 탭에서 여러 시작점으로 패턴 일관성을 확인하세요.
      </div>
      <div className="sens-best-grid-head">
        <span>항목</span>
        <span>현재(기준)</span>
        <span>현재 수익률</span>
        <span>최적 설정</span>
        <span>최적 수익률</span>
        <span>차이</span>
      </div>
      <div className="sens-best-rows">
        {rows.map((row, i) => {
          const diff = row.bestVal - row.currentVal;
          const isSame = Math.abs(diff) < 0.05;
          const isNoise = !isSame && Math.abs(diff) < 10;
          return (
            <div key={i} className="sens-best-row">
              <span className="sens-best-label">{row.label}</span>
              <span className={`sens-best-val${isSame ? " sens-best-bold" : " sens-muted"}`}>{row.currentLabel}</span>
              <span className={`sens-best-return${isSame ? "" : " sens-muted"}`}>
                {fmtReturn(row.currentVal)}
                {row.currentWR != null && <span className="sens-win-rate">승률 {row.currentWR}%</span>}
              </span>
              <span className={`sens-best-val${isSame ? " sens-muted" : " sens-best-bold"}`}>{row.bestLabel}</span>
              <span className="sens-best-return" style={{ color: isSame ? "var(--muted)" : row.bestVal >= 0 ? "var(--green)" : "var(--red)" }}>
                {fmtReturn(row.bestVal)}
                {row.bestWR != null && <span className="sens-win-rate">{row.bestWR}%</span>}
              </span>
              <span className="sens-best-diff" style={{ color: isSame ? "var(--muted)" : isNoise ? "rgba(255,200,80,0.7)" : diff > 0 ? "var(--green)" : "var(--red)" }}>
                {isSame ? "동일" : `${diff >= 0 ? "+" : ""}${diff.toFixed(1)}%p`}
                {isNoise && <span className="sens-noise-tag">노이즈</span>}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// 1D 스윕 바 차트
function SweepChart({ items }) {
  const values = items.map(it => it.summary.totalReturn);
  const maxAbs = Math.max(...values.map(Math.abs), 0.01);
  return (
    <div className="sens-sweep-chart">
      {items.map((item, i) => {
        const v = values[i];
        const pct = Math.abs(v) / maxAbs * 100;
        const color = v >= 0 ? "var(--green)" : "var(--red)";
        return (
          <div key={i} className={`sens-sweep-row${item.isCurrent ? " sens-sweep-current" : ""}`}>
            <span className="sens-sweep-label">
              {item.isCurrent && <span className="sens-star">★ </span>}
              {item.label}
            </span>
            <div className="sens-sweep-bar-wrap">
              <div className="sens-sweep-bar" style={{ width: `${pct.toFixed(1)}%`, background: color }} />
            </div>
            <span className="sens-sweep-value" style={{ color }}>{fmtReturn(v)}</span>
            <span className="sens-sweep-dd">낙폭 -{item.summary.maxDrawdown.toFixed(1)}%</span>
          </div>
        );
      })}
    </div>
  );
}

const METRICS_BASE = [
  { key: "totalReturn", label: "총수익률", format: v => fmtReturn(v), better: "higher" },
  { key: "maxDrawdown", label: "최대낙폭", format: v => `-${Math.abs(v).toFixed(1)}%`, better: "lower" },
  { key: "totalCycles", label: "총사이클", format: v => `${v}회`, better: "neutral" },
  { key: "dongCount", label: "똥이월", format: v => `${v}회`, better: "lower" },
];

function CompareTable({ title, guide, rows, showVirtual = false }) {
  const baseline = rows[0]?.summary;
  const metrics = showVirtual
    ? [...METRICS_BASE, { key: "virtualBuyCount", label: "샀다치고", format: v => `${v}회`, better: "lower" }]
    : METRICS_BASE;

  function getCellStyle(key, value, baseValue, better) {
    if (better === "neutral" || value === baseValue) return {};
    let improved;
    if (better === "higher") improved = value > baseValue;
    else improved = value < baseValue;
    return { color: improved ? "var(--green)" : "var(--red)" };
  }

  return (
    <div className="sens-section">
      <div className="sens-section-title">{title}</div>
      {guide && <div className="sens-guide">{guide}</div>}
      <div className="sens-table-wrap">
        <table className="sens-table">
          <thead>
            <tr>
              <th className="sens-th-metric">항목</th>
              {rows.map((r, i) => (
                <th key={i} className="sens-th-val">
                  {r.label}
                  {i === 0 && <span className="sens-baseline-tag">기준</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {metrics.map(m => (
              <tr key={m.key}>
                <td className="sens-td-metric">{m.label}</td>
                {rows.map((r, i) => {
                  const v = r.summary[m.key];
                  const bv = baseline[m.key];
                  return (
                    <td key={i} className="sens-td-val"
                      style={i === 0 ? {} : getCellStyle(m.key, v, bv, m.better)}>
                      {m.format(v)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function SensitivityPage() {
  const [symbol, setSymbol] = useState("SOXL");
  const [from, setFrom] = useState(getDefaultFrom());
  const [to, setTo] = useState(todayKST());
  const [investment, setInvestment] = useState(String(DEFAULT_USD));
  const [porang, setPorang] = useState("15");
  const [buyRateInput, setBuyRateInput] = useState("0.20");
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const prefix = isKoreanSymbol(symbol) ? "₩" : "$";

  async function handleRun() {
    if (!symbol || !from || !to) return;
    setLoading(true);
    setError(null);
    setResults(null);

    try {
      const lb = new Date(from);
      lb.setDate(lb.getDate() - 7);
      const data = await fetchPrices(symbol.toUpperCase(), lb.toISOString().split("T")[0], to);
      if (data.prices.length < 5) throw new Error("해당 기간 데이터가 부족합니다.");

      const priceData = data.prices;
      const inv = Number(investment) || DEFAULT_USD;
      const basePorang = Math.max(1, Math.min(30, Number(porang) || 15));
      const baseBuyRate = Math.max(0.0001, (parseFloat(buyRateInput) || 0.2) / 100);

      // Group 1: 분할수 × buyRate 2D matrix
      const matrix = PORANG_SWEEP.map(p =>
        BUYRATE_SWEEP.map(br => runBacktest(priceData, inv, from, p, br).summary)
      );

      // Groups 2-6: 기준 설정으로 opts만 바꿔가며 비교 (opts 저장)
      const runItem = (label, opts) => ({
        label, opts,
        summary: runBacktest(priceData, inv, from, basePorang, baseBuyRate, opts).summary,
      });

      const virtualBuyCompare = [
        runItem("현재 (LP 갱신)", { virtualBuyMode: "update_lp" }),
        runItem("비활성화 (LP 고정)", { virtualBuyMode: "keep_lp" }),
        runItem("포랭 초과 시 실제 매수", { virtualBuyMode: "always_buy" }),
      ];

      const updownSellCompare = [
        runItem("종가 ≥ LP (현재)", { updownSellBuffer: 0 }),
        runItem("종가 ≥ LP + 0.5%", { updownSellBuffer: 0.005 }),
        runItem("종가 ≥ LP + 1.0%", { updownSellBuffer: 0.01 }),
      ];

      const tteobSellCompare = [
        runItem("매수가 이상 (현재)", { tteobSellBuffer: 0 }),
        runItem("매수가 + 0.5%", { tteobSellBuffer: 0.005 }),
        runItem("매수가 + 1.0%", { tteobSellBuffer: 0.01 }),
      ];

      const tteobBuyCompare = [
        runItem("전일종가 − $0.01 (현재)", { tteobOrderPct: null }),
        runItem("전일종가 × 0.995 (−0.5%)", { tteobOrderPct: 0.005 }),
        runItem("전일종가 × 0.99 (−1%)", { tteobOrderPct: 0.01 }),
      ];

      const firstDayCompare = [
        runItem("+10% 초과 제외 (현재)", { firstDayGapFilter: 1.10 }),
        runItem("+5% 초과 제외 (엄격)", { firstDayGapFilter: 1.05 }),
        runItem("+15% 초과 제외 (관대)", { firstDayGapFilter: 1.15 }),
        runItem("+20% 초과 제외", { firstDayGapFilter: 1.20 }),
      ];

      const splitWeightCompare = [
        runItem("균등 분할 (현재)", { splitWeightMode: "equal" }),
        runItem("역피라미드 (저점 집중)", { splitWeightMode: "linear_up" }),
        runItem("피라미드 (초반 집중)", { splitWeightMode: "linear_down" }),
      ];

      // 1D 스윕: 분할수만 변경 (baseBuyRate 고정)
      const porangSweep = PORANG_SWEEP.map(p => ({
        label: `${p}분할`,
        isCurrent: p === basePorang,
        summary: runBacktest(priceData, inv, from, p, baseBuyRate).summary,
      }));

      // 1D 스윕: 매수배율만 변경 (basePorang 고정)
      const buyRateSweep = BUYRATE_SWEEP.map(br => ({
        label: `${(br * 100).toFixed(1)}%`,
        isCurrent: Math.abs(br - baseBuyRate) < 0.00005,
        summary: runBacktest(priceData, inv, from, basePorang, br).summary,
      }));

      // 롤링 승률 계산 (현재 vs 최적 조합)
      const wr = (p, br, opts) => computeRollingWinRate(priceData, from, p, br, opts);
      const findBestItem = arr => arr.reduce((b, r) => r.summary.totalReturn > b.summary.totalReturn ? r : b);

      let bestMatrixP = basePorang, bestMatrixBr = baseBuyRate, bestMatrixRet = -Infinity;
      PORANG_SWEEP.forEach((p, pi) => BUYRATE_SWEEP.forEach((br, bi) => {
        if (matrix[pi][bi].totalReturn > bestMatrixRet) {
          bestMatrixRet = matrix[pi][bi].totalReturn; bestMatrixP = p; bestMatrixBr = br;
        }
      }));

      const rollingRates = {
        matrix:      { current: wr(basePorang, baseBuyRate, {}),     best: wr(bestMatrixP, bestMatrixBr, {}) },
        virtualBuy:  { current: wr(basePorang, baseBuyRate, virtualBuyCompare[0].opts),   best: wr(basePorang, baseBuyRate, findBestItem(virtualBuyCompare).opts) },
        updownSell:  { current: wr(basePorang, baseBuyRate, updownSellCompare[0].opts),   best: wr(basePorang, baseBuyRate, findBestItem(updownSellCompare).opts) },
        tteobSell:   { current: wr(basePorang, baseBuyRate, tteobSellCompare[0].opts),    best: wr(basePorang, baseBuyRate, findBestItem(tteobSellCompare).opts) },
        tteobBuy:    { current: wr(basePorang, baseBuyRate, tteobBuyCompare[0].opts),     best: wr(basePorang, baseBuyRate, findBestItem(tteobBuyCompare).opts) },
        firstDay:    { current: wr(basePorang, baseBuyRate, firstDayCompare[0].opts),     best: wr(basePorang, baseBuyRate, findBestItem(firstDayCompare).opts) },
        splitWeight: { current: wr(basePorang, baseBuyRate, splitWeightCompare[0].opts),  best: wr(basePorang, baseBuyRate, findBestItem(splitWeightCompare).opts) },
      };

      setResults({ matrix, porangSweep, buyRateSweep, virtualBuyCompare, updownSellCompare, tteobSellCompare, tteobBuyCompare, firstDayCompare, splitWeightCompare, basePorang, baseBuyRate, rollingRates });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="sensitivity-page">
      <div className="section-title">
        민감도 분석
        <span className="section-sub">파라미터 변형에 따른 수익률 변화 비교</span>
      </div>

      <div className="rolling-form">
        <div className="rolling-form-periods">
          {PERIODS.map(p => (
            <button key={p.label} className="chip"
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
                onChange={e => setInvestment(e.target.value)} style={{ width: 120 }} />
            </div>
          </div>
          <div className="rolling-form-field">
            <label className="rolling-form-label">기준 분할</label>
            <input className="input porang-input" type="number" value={porang}
              onChange={e => setPorang(e.target.value)} min={1} max={30} />
          </div>
          <div className="rolling-form-field">
            <label className="rolling-form-label">기준 매수배율 (%)</label>
            <input className="input" type="number" value={buyRateInput}
              onChange={e => setBuyRateInput(e.target.value)}
              step="0.01" min="0.01" style={{ width: 80 }} />
          </div>
          <button className="run-btn" onClick={handleRun} disabled={loading}>
            {loading ? "분석 중..." : "▶ 분석 실행"}
          </button>
        </div>
        {error && <div className="error-box"><span className="error-icon">⚠</span> {error}</div>}
      </div>

      {loading && (
        <div className="loading-box">
          <div className="spinner" />
          <span>조합별 백테스트 계산 중...</span>
        </div>
      )}

      {results && (
        <>
          <BestSummary results={results} />

          <div className="sens-section sens-sweep-pair">
            <div className="sens-sweep-half">
              <div className="sens-section-title">분할수 비교
                <span className="sens-section-fixed">매수배율 {(results.baseBuyRate * 100).toFixed(2)}% 고정</span>
              </div>
              <div className="sens-guide">★ = 기준값. 같은 기간·같은 매수배율에서 분할수만 바꾼 결과입니다. 수익률 차이가 수십 %p 미만이면 단일 백테스트 노이즈 범위일 수 있으니 낙폭도 함께 확인하세요.</div>
              <SweepChart items={results.porangSweep} />
            </div>
            <div className="sens-sweep-half">
              <div className="sens-section-title">매수배율 비교
                <span className="sens-section-fixed">{results.basePorang}분할 고정</span>
              </div>
              <div className="sens-guide">★ = 기준값. threshold = LP × (1 − 매수배율 × 포랭). 배율이 높을수록 더 많이 내려야 추가 매수가 발생합니다.</div>
              <SweepChart items={results.buyRateSweep} />
            </div>
          </div>

          <div className="sens-section">
            <div className="sens-section-title">분할수 × 매수배율 수익률 매트릭스</div>
            <div className="sens-guide">
              분할수와 매수배율 조합 20가지의 총수익률 비교. 색은 이 매트릭스 안에서의 상대적 순위 — 진한 초록 = 가장 높은 수익, 흐린 색 = 상대적으로 낮은 수익 (손실 구간이 있으면 빨강). 기준값({results.basePorang}분할 / {(results.baseBuyRate * 100).toFixed(2)}%)에 ★ 표시. 셀에 마우스를 올리면 최대낙폭과 사이클 수도 볼 수 있습니다.
            </div>
            <MatrixTable matrix={results.matrix} basePorang={results.basePorang} baseBuyRate={results.baseBuyRate} />
          </div>

          <CompareTable
            title="샀다치고 변형"
            guide="포랭 만석(15/15) 상태에서 매수 조건이 또 충족될 때의 동작. ▸ 현재(LP 갱신): 실제 매수 없이 LP를 오늘 종가로 낮춤 → 조금만 반등해도 매도 발동, 사이클 빠르게 회전. ▸ 비활성화(LP 고정): LP를 바꾸지 않음 → 이전 실제 매수가까지 회복해야만 매도 발동, 더 오래 보유."
            rows={results.virtualBuyCompare}
            showVirtual
          />
          <CompareTable
            title="업다운 매도 조건"
            guide="종가가 LP보다 얼마나 더 올라야 포트 1개를 매도하는지. 목표가를 높이면 사이클당 수익이 커지지만 매도 시점이 늦어져 총사이클 수가 줄어들 수 있습니다."
            rows={results.updownSellCompare}
          />
          <CompareTable
            title="떨법 매도 조건"
            guide="각 떨법 묶음을 매수가보다 얼마 이상 올랐을 때 매도하는지. 수수료와 슬리피지를 감안하면 0.5~1% 마진이 실질적인 손익분기 역할을 할 수 있습니다."
            rows={results.tteobSellCompare}
          />
          <CompareTable
            title="떨법 매수 지정가"
            guide="전일 종가 기준으로 얼마나 낮아야 떨법 매수가 체결되는지. 기준을 낮추면 체결 빈도가 줄고 진입 가격은 유리해지지만 떨법 기회 자체를 놓칠 수 있습니다."
            rows={results.tteobBuyCompare}
          />
          <CompareTable
            title="첫날 급등 필터"
            guide="전일 대비 이 비율 이상 오른 날엔 업다운 첫 진입을 건너뜁니다. 기준을 낮추면 고점 진입을 더 많이 피하지만, 상승 추세 시작일도 놓칠 수 있습니다."
            rows={results.firstDayCompare}
          />
          <CompareTable
            title="분할 금액 구조"
            guide="차수별 매수 금액 비중을 바꿉니다. 역피라미드는 나중 차수(저점)에 더 많이 투입하고, 피라미드는 초반 차수에 더 많이 투입합니다. 총 투자금은 동일합니다."
            rows={results.splitWeightCompare}
          />
        </>
      )}

      {!results && !loading && (
        <div className="rolling-empty" style={{ marginTop: 40 }}>
          설정을 입력하고 분석을 실행하세요.
        </div>
      )}
    </section>
  );
}
