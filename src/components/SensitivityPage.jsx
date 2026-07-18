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

const PORANG_SWEEP = [10, 12, 15, 18, 20];
const BUYRATE_SWEEP = [0.001, 0.002, 0.003, 0.005];

function heatColor(value, maxAbs) {
  if (maxAbs === 0) return "transparent";
  const ratio = Math.min(Math.abs(value) / maxAbs, 1);
  const alpha = 0.12 + ratio * 0.55;
  if (value >= 0) return `rgba(52,211,153,${alpha.toFixed(2)})`;
  return `rgba(248,113,113,${alpha.toFixed(2)})`;
}

function fmtReturn(v) {
  if (v == null) return "-";
  return (v >= 0 ? "+" : "") + v.toFixed(1) + "%";
}

function MatrixTable({ matrix, basePorang, baseBuyRate }) {
  const allValues = matrix.flat().map(s => s.totalReturn);
  const maxAbs = Math.max(...allValues.map(Math.abs), 0.01);

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
                    style={{ background: heatColor(s.totalReturn, maxAbs) }}
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

      // Groups 2-6: 기준 설정으로 opts만 바꿔가며 비교
      const run = (opts) => runBacktest(priceData, inv, from, basePorang, baseBuyRate, opts).summary;

      const virtualBuyCompare = [
        { label: "현재 (LP 갱신)", summary: run({ virtualBuyMode: "update_lp" }) },
        { label: "비활성화 (LP 고정)", summary: run({ virtualBuyMode: "keep_lp" }) },
      ];

      const updownSellCompare = [
        { label: "종가 ≥ LP (현재)", summary: run({ updownSellBuffer: 0 }) },
        { label: "종가 ≥ LP + 0.5%", summary: run({ updownSellBuffer: 0.005 }) },
        { label: "종가 ≥ LP + 1.0%", summary: run({ updownSellBuffer: 0.01 }) },
      ];

      const tteobSellCompare = [
        { label: "매수가 이상 (현재)", summary: run({ tteobSellBuffer: 0 }) },
        { label: "매수가 + 0.5%", summary: run({ tteobSellBuffer: 0.005 }) },
        { label: "매수가 + 1.0%", summary: run({ tteobSellBuffer: 0.01 }) },
      ];

      const tteobBuyCompare = [
        { label: "전일종가 − $0.01 (현재)", summary: run({ tteobOrderPct: null }) },
        { label: "전일종가 × 0.995 (−0.5%)", summary: run({ tteobOrderPct: 0.005 }) },
        { label: "전일종가 × 0.99 (−1%)", summary: run({ tteobOrderPct: 0.01 }) },
      ];

      const firstDayCompare = [
        { label: "+10% 초과 제외 (현재)", summary: run({ firstDayGapFilter: 1.10 }) },
        { label: "+5% 초과 제외 (엄격)", summary: run({ firstDayGapFilter: 1.05 }) },
        { label: "+15% 초과 제외 (관대)", summary: run({ firstDayGapFilter: 1.15 }) },
        { label: "+20% 초과 제외", summary: run({ firstDayGapFilter: 1.20 }) },
      ];

      setResults({ matrix, virtualBuyCompare, updownSellCompare, tteobSellCompare, tteobBuyCompare, firstDayCompare, basePorang, baseBuyRate });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="sensitivity-page">
      <div className="section-title">
        변수 민감도
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
          <div className="sens-section">
            <div className="sens-section-title">분할수 × 매수배율 수익률 매트릭스</div>
            <div className="sens-guide">
              분할수와 매수배율 조합 20가지의 총수익률. 진한 초록 = 가장 좋은 수익, 진한 빨강 = 최대 손실.
              기준값({results.basePorang}분할 / {(results.baseBuyRate * 100).toFixed(2)}%)에 ★ 표시.
              셀에 마우스를 올리면 최대낙폭과 사이클 수도 볼 수 있습니다.
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
