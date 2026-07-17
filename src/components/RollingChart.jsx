import { useMemo, useState } from "react";
import { runBacktest } from "../engine/switchEngine";
import {
  BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer, Cell,
} from "recharts";

// 종료일은 백테스트 설정의 to로 고정.
// 시작일만 from → to 방향으로 stepDays씩 밀어가며 반복 테스트.
// 예: from=25/1/1, to=25/7/17, 간격=1일
//   → 25/1/1~7/17, 25/1/2~7/17, 25/1/3~7/17, ...
const STEP_OPTIONS = [
  { value: 1,  label: "1일" },
  { value: 7,  label: "1주" },
  { value: 14, label: "2주" },
  { value: 28, label: "4주" },
];

const MIN_TRADING_DAYS = 5; // 시작일이 종료일에 너무 가까우면 제외

// 승률 기준으로 전략의 진입 시점 민감도를 문장으로 표현
function getInsight(winRate, avgReturn, results) {
  const positiveCount = results.filter(r => r.totalReturn > 0).length;
  const total = results.length;

  // 연속 손실 구간이 있는지 체크 (3회 이상 연속 마이너스)
  let maxLossStreak = 0, streak = 0;
  for (const r of results) {
    if (r.totalReturn < 0) { streak++; maxLossStreak = Math.max(maxLossStreak, streak); }
    else streak = 0;
  }

  if (winRate >= 80) {
    return {
      verdict: "진입 시점에 둔감한 전략",
      color: "var(--green)",
      detail: `${total}번 중 ${positiveCount}번(${winRate.toFixed(0)}%)에서 수익. 언제 시작해도 대체로 결과가 좋습니다. 전략 자체의 우위가 있다는 신호입니다.`,
    };
  } else if (winRate >= 60) {
    return {
      verdict: "대체로 양호, 일부 구간 주의",
      color: "var(--accent2)",
      detail: `${total}번 중 ${positiveCount}번(${winRate.toFixed(0)}%)에서 수익. 대부분 괜찮지만 손실 구간도 있습니다. 차트에서 빨간 막대가 몰려 있는 시기를 확인하세요.`,
    };
  } else if (winRate >= 40) {
    return {
      verdict: "진입 시점에 민감한 전략",
      color: "var(--accent2)",
      detail: `${total}번 중 ${positiveCount}번(${winRate.toFixed(0)}%)에서 수익. 언제 시작하느냐가 결과에 큰 영향을 줍니다. 빨간 막대가 집중된 구간(하락 추세 진입)을 피하는 게 중요합니다.`,
    };
  } else {
    return {
      verdict: "대부분 구간에서 손실",
      color: "var(--red)",
      detail: `${total}번 중 ${positiveCount}번(${winRate.toFixed(0)}%)에서만 수익. 해당 기간 자체가 이 전략에 불리한 시장 환경이었을 가능성이 높습니다. 더 긴 기간으로 재확인해보세요.`,
    };
  }
}

// ─── 박스플롯 통계 계산 ────────────────────────────────────────────────────
function calcBoxStats(values) {
  if (values.length < 4) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const pct = (p) => {
    const idx = p * (n - 1);
    const lo = Math.floor(idx), hi = Math.ceil(idx);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
  };
  const q1 = pct(0.25), median = pct(0.5), q3 = pct(0.75);
  const iqr = q3 - q1;
  const wLow = Math.max(sorted[0], q1 - 1.5 * iqr);
  const wHigh = Math.min(sorted[n - 1], q3 + 1.5 * iqr);
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const outliers = sorted.filter(v => v < wLow || v > wHigh);
  return { q1, median, q3, iqr, mean, wLow, wHigh, outliers };
}

// ─── 박스플롯 SVG 렌더러 ─────────────────────────────────────────────────
function BoxPlotSVG({ wLow, q1, median, q3, wHigh, mean, outliers }) {
  const W = 600, H = 120;
  const padL = 8, padR = 8, padTop = 8, padBot = 22;
  const boxCy = padTop + (H - padTop - padBot) / 2 + 2;
  const halfBox = 24;

  const allVals = [wLow, q1, median, q3, wHigh, mean, ...outliers];
  const rawMin = Math.min(...allVals), rawMax = Math.max(...allVals);
  const span = rawMax - rawMin || 10;
  const vMin = rawMin - span * 0.14, vMax = rawMax + span * 0.14;
  const xs = v => padL + (v - vMin) / (vMax - vMin) * (W - padL - padR);

  // 눈금 계산
  const rawStep = span / 5;
  const mag = Math.pow(10, Math.floor(Math.log10(Math.abs(rawStep) || 1)));
  const step = Math.ceil(rawStep / mag) * mag || 1;
  const firstTick = Math.ceil(vMin / step) * step;
  const ticks = [];
  for (let v = firstTick; v <= vMax + 0.001; v = parseFloat((v + step).toFixed(10))) ticks.push(v);

  const boxColor = median >= 0 ? "#34d399" : "#f87171";
  const boxFill = median >= 0 ? "rgba(52,211,153,0.13)" : "rgba(248,113,113,0.13)";

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", maxWidth: 680, display: "block" }}>
      {/* 0% 기준선 */}
      {vMin < 0 && vMax > 0 && (
        <line x1={xs(0)} x2={xs(0)} y1={padTop} y2={H - padBot}
          stroke="rgba(255,255,255,0.2)" strokeDasharray="4 3" />
      )}
      {/* 축 */}
      <line x1={padL} x2={W - padR} y1={H - padBot} y2={H - padBot} stroke="#333" />
      {/* 눈금 */}
      {ticks.map((tv, i) => (
        <g key={i}>
          <line x1={xs(tv)} x2={xs(tv)} y1={H - padBot} y2={H - padBot + 4} stroke="#444" />
          <text x={xs(tv)} y={H - 5} textAnchor="middle" fill="#555" fontSize={9}>
            {(tv >= 0 ? "+" : "") + tv.toFixed(Number.isInteger(tv) ? 0 : 1) + "%"}
          </text>
        </g>
      ))}
      {/* 수염(whisker) */}
      <line x1={xs(wLow)} x2={xs(q1)} y1={boxCy} y2={boxCy} stroke="#777" strokeWidth={2} />
      <line x1={xs(q3)} x2={xs(wHigh)} y1={boxCy} y2={boxCy} stroke="#777" strokeWidth={2} />
      {[wLow, wHigh].map((v, i) => (
        <line key={i} x1={xs(v)} x2={xs(v)} y1={boxCy - 10} y2={boxCy + 10} stroke="#777" strokeWidth={2} />
      ))}
      {/* IQR 박스 */}
      <rect x={xs(q1)} y={boxCy - halfBox} width={Math.max(1, xs(q3) - xs(q1))} height={halfBox * 2}
        fill={boxFill} stroke={boxColor} strokeWidth={1.5} rx={2} />
      {/* 중앙값 세로선 */}
      <line x1={xs(median)} x2={xs(median)} y1={boxCy - halfBox} y2={boxCy + halfBox}
        stroke={boxColor} strokeWidth={3} />
      {/* 평균 다이아몬드 */}
      <polygon
        points={`${xs(mean)},${boxCy - 8} ${xs(mean) + 6},${boxCy} ${xs(mean)},${boxCy + 8} ${xs(mean) - 6},${boxCy}`}
        fill="#00d4aa"
      />
      {/* 이상치 점 (결정적 지터 — Math.random 회피) */}
      {outliers.map((v, i) => (
        <circle key={i}
          cx={xs(v)} cy={boxCy + ((i * 13 + 5) % 9 - 4) * 5}
          r={3.5} fill="rgba(255,190,80,0.85)" />
      ))}
    </svg>
  );
}

// ─── 박스플롯 섹션 (설명 + SVG + 해석) ────────────────────────────────────
function BoxPlotSection({ results }) {
  const values = results.map(r => r.totalReturn);
  const stats = calcBoxStats(values);
  if (!stats) return null;
  const { q1, median, q3, iqr, mean, wLow, wHigh, outliers } = stats;
  const fmt = v => (v >= 0 ? "+" : "") + v.toFixed(2) + "%";

  // 결과 해석 텍스트
  let interp = `중앙값 ${fmt(median)} — ${median >= 0 ? "절반 이상의 진입 시점에서 수익이 났습니다" : "절반 이상의 진입 시점에서 손실이 발생했습니다"}.`;
  interp += ` 중간 50% 구간(IQR)은 ${fmt(q1)} ~ ${fmt(q3)} (폭 ${iqr.toFixed(1)}%p).`;
  if (iqr < 5) interp += " 폭이 좁아 시작 시점에 관계없이 안정적인 결과를 기대할 수 있습니다.";
  else if (iqr < 20) interp += " 시장 국면에 따라 결과가 일부 달라지지만 전략의 방향성은 일관됩니다.";
  else interp += " 폭이 넓어 진입 타이밍이 최종 결과를 크게 좌우합니다.";
  if (Math.abs(mean - median) > 2) {
    if (mean > median) interp += ` 평균(${fmt(mean)})이 중앙값보다 높아, 소수의 고수익 구간이 평균을 끌어올리고 있습니다.`;
    else interp += ` 평균(${fmt(mean)})이 중앙값보다 낮아, 일부 큰 손실 구간이 전체 평균을 떨어뜨리고 있습니다.`;
  }
  if (outliers.length > 0) {
    interp += ` 이상치 ${outliers.length}개(황색 점) — 특정 시점에서 극단적 결과가 발생했습니다.`;
  }

  return (
    <div className="rolling-section">
      <div className="rolling-chart-title">수익률 분포 — 박스플롯</div>
      <div className="rolling-section-guide">
        <strong>보는 법:</strong> 박스 = 중간 50% 범위(IQR). <strong>박스가 좁을수록</strong> 언제 시작해도 결과가 비슷합니다.
        세로 굵은 선 = 중앙값 | ◆(청록) = 평균 | 수염 = 이상치 제외 최솟·최댓값 | 황색 점 = 이상치.
        박스가 0% 위쪽에 자리잡을수록 전략 자체의 우위가 강한 것입니다.
      </div>
      <BoxPlotSVG {...{ wLow, q1, median, q3, wHigh, mean, outliers }} />
      {/* 수치 범례 */}
      <div className="box-stats-row">
        {[
          { label: "수염 하한", v: wLow },
          { label: "Q1 (25%)", v: q1 },
          { label: "중앙값", v: median, bold: true },
          { label: "평균 ◆", v: mean, teal: true },
          { label: "Q3 (75%)", v: q3 },
          { label: "수염 상한", v: wHigh },
        ].map(({ label, v, bold, teal }) => (
          <div key={label} className="box-stat-item">
            <span className="box-stat-label">{label}</span>
            <span className={`box-stat-value ${teal ? "val-teal" : v >= 0 ? "val-green" : "val-red"}`}
              style={bold ? { fontWeight: 700 } : {}}>
              {fmt(v)}
            </span>
          </div>
        ))}
      </div>
      <div className="rolling-interp">📊 {interp}</div>
    </div>
  );
}

// ─── 히트맵 섹션 (월별 평균 수익률) ─────────────────────────────────────
const MONTH_LABELS = ["1월","2월","3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"];

function heatColor(v, maxAbs) {
  const ratio = Math.min(1, Math.abs(v) / (maxAbs || 1));
  const alpha = 0.15 + ratio * 0.75;
  return v >= 0
    ? `rgba(52,211,153,${alpha.toFixed(2)})`
    : `rgba(248,113,113,${alpha.toFixed(2)})`;
}

function HeatmapSection({ results }) {
  // YYYY-MM별 수익률 집계
  const monthMap = {};
  for (const r of results) {
    const key = r.startDate.slice(0, 7);
    if (!monthMap[key]) monthMap[key] = { total: 0, count: 0 };
    monthMap[key].total += r.totalReturn;
    monthMap[key].count += 1;
  }
  const months = Object.entries(monthMap).map(([k, v]) => ({
    key: k, year: +k.slice(0, 4), month: +k.slice(5, 7), avg: v.total / v.count, count: v.count,
  }));
  if (!months.length) return null;

  const years = [...new Set(months.map(m => m.year))].sort();
  const allAvgs = months.map(m => m.avg);
  const maxAbs = Math.max(Math.abs(Math.min(...allAvgs)), Math.abs(Math.max(...allAvgs)), 0.1);

  // 월별 전체 평균 (모든 연도 통합)
  const byMonth = Array.from({ length: 12 }, (_, mi) => {
    const ms = months.filter(m => m.month === mi + 1);
    if (!ms.length) return null;
    return { month: mi + 1, avg: ms.reduce((s, m) => s + m.avg, 0) / ms.length };
  }).filter(Boolean);

  // 해석 텍스트
  let interp = "";
  if (byMonth.length >= 3) {
    const best = byMonth.reduce((a, b) => a.avg > b.avg ? a : b);
    const worst = byMonth.reduce((a, b) => a.avg < b.avg ? a : b);
    interp = `${MONTH_LABELS[best.month - 1]}에 시작한 경우 평균 ${best.avg >= 0 ? "+" : ""}${best.avg.toFixed(2)}%로 가장 좋았고, ${MONTH_LABELS[worst.month - 1]}은 ${worst.avg >= 0 ? "+" : ""}${worst.avg.toFixed(2)}%로 가장 나빴습니다.`;
    const posCount = byMonth.filter(m => m.avg > 0).length;
    if (posCount >= 10) interp += ` ${posCount}/12개월이 수익권으로, 계절적 영향이 크지 않습니다.`;
    else if (posCount >= 6) interp += ` 절반 이상 수익권이지만 ${MONTH_LABELS[worst.month-1]} 전후 진입은 상대적으로 불리합니다.`;
    else interp += ` 특정 기간에 손실이 집중됩니다. 빨간 셀이 연속된 구간은 시장 하락 국면과 겹쳤을 가능성이 높습니다.`;
  }
  if (years.length >= 2) {
    // 연도별 패턴 비교
    const yearAvgs = years.map(y => ({
      year: y, avg: months.filter(m => m.year === y).reduce((s, m) => s + m.avg, 0) /
        months.filter(m => m.year === y).length,
    }));
    const bestYear = yearAvgs.reduce((a, b) => a.avg > b.avg ? a : b);
    const worstYear = yearAvgs.reduce((a, b) => a.avg < b.avg ? a : b);
    if (bestYear.year !== worstYear.year) {
      interp += ` 연도별로는 ${bestYear.year}년이 평균 ${bestYear.avg >= 0 ? "+" : ""}${bestYear.avg.toFixed(1)}%로 가장 좋았고, ${worstYear.year}년이 ${worstYear.avg >= 0 ? "+" : ""}${worstYear.avg.toFixed(1)}%로 가장 어려운 해였습니다.`;
    }
  }

  return (
    <div className="rolling-section">
      <div className="rolling-chart-title">월별 평균 수익률 — 히트맵</div>
      <div className="rolling-section-guide">
        <strong>보는 법:</strong> 각 셀 = 해당 연·월에 시작했을 때의 평균 수익률.
        진한 초록 = 좋은 진입 시점 | 진한 빨강 = 나쁜 진입 시점 | 흐린 색 = 효과 미미.
        같은 달(열)이 매년 비슷한 색이라면 <strong>계절적 패턴</strong>이 존재한다는 신호입니다.
        맨 아래 행은 월별 전체 평균입니다.
      </div>
      <div className="heatmap-wrap">
        <div className="heatmap-grid" style={{ gridTemplateColumns: `48px repeat(12, 1fr)` }}>
          {/* 헤더 행 */}
          <div className="heatmap-cell heatmap-header" />
          {MONTH_LABELS.map(m => <div key={m} className="heatmap-cell heatmap-header">{m}</div>)}
          {/* 연도별 행 */}
          {years.map(year => (
            <div key={year} style={{ display: "contents" }}>
              <div className="heatmap-cell heatmap-year">{year}</div>
              {Array.from({ length: 12 }, (_, mi) => {
                const key = `${year}-${String(mi + 1).padStart(2, "0")}`;
                const d = monthMap[key];
                if (!d) return <div key={mi} className="heatmap-cell heatmap-empty">—</div>;
                const avg = d.total / d.count;
                return (
                  <div key={mi} className="heatmap-cell heatmap-value"
                    style={{ background: heatColor(avg, maxAbs) }}
                    title={`${year}년 ${MONTH_LABELS[mi]}: ${avg >= 0 ? "+" : ""}${avg.toFixed(2)}% (${d.count}회 평균)`}>
                    {avg >= 0 ? "+" : ""}{avg.toFixed(1)}
                  </div>
                );
              })}
            </div>
          ))}
          {/* 월별 평균 행 */}
          {byMonth.length >= 2 && (
            <div style={{ display: "contents" }}>
              <div className="heatmap-cell heatmap-year" style={{ fontSize: 9 }}>평균</div>
              {Array.from({ length: 12 }, (_, mi) => {
                const m = byMonth.find(b => b.month === mi + 1);
                if (!m) return <div key={mi} className="heatmap-cell heatmap-empty">—</div>;
                return (
                  <div key={mi} className="heatmap-cell heatmap-value heatmap-avg"
                    style={{ background: heatColor(m.avg, maxAbs) }}>
                    {m.avg >= 0 ? "+" : ""}{m.avg.toFixed(1)}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <div className="rolling-interp">🗓 {interp}</div>
    </div>
  );
}

// ─── 메인 컴포넌트 ─────────────────────────────────────────────────────────
export default function RollingChart({ prices, investment, maxPorang, from, to }) {
  const [stepDays, setStepDays] = useState(7);

  const results = useMemo(() => {
    if (!prices || prices.length < 10 || !from || !to) return [];

    const dates = prices.map(p => p.date);
    const out = [];
    let curObj = new Date(from);

    while (true) {
      const curStr = curObj.toISOString().split("T")[0];
      if (curStr >= to) break;

      const remaining = dates.filter(d => d >= curStr && d <= to);
      if (remaining.length < MIN_TRADING_DAYS) break;

      const result = runBacktest(prices, investment, curStr, maxPorang);

      const ret = result.summary.totalReturn;
      out.push({
        startDate: curStr,
        label: curStr.slice(2, 10), // YY-MM-DD
        totalReturn: ret,
        positiveReturn: Math.max(0, ret), // 양수 영역만 (0 이하는 0)
        negativeReturn: Math.min(0, ret), // 음수 영역만 (0 이상은 0)
        maxDrawdown: result.summary.maxDrawdown,
        totalCycles: result.summary.totalCycles,
        dongCount: result.summary.dongCount,
        virtualBuyCount: result.summary.virtualBuyCount ?? 0,
      });

      curObj.setDate(curObj.getDate() + stepDays);
    }

    return out;
  }, [prices, investment, maxPorang, from, to, stepDays]);

  if (!prices || prices.length < 10) {
    return <div className="rolling-empty">백테스트를 먼저 실행해주세요.</div>;
  }

  const count = results.length;
  if (count === 0) {
    return (
      <div className="rolling-empty">
        테스트 가능한 시작 시점이 없습니다. 더 긴 기간으로 백테스트를 실행해주세요.
      </div>
    );
  }

  const avgReturn = results.reduce((s, r) => s + r.totalReturn, 0) / count;
  const minReturn = Math.min(...results.map(r => r.totalReturn));
  const maxReturn = Math.max(...results.map(r => r.totalReturn));
  const winRate = results.filter(r => r.totalReturn > 0).length / count * 100;
  const avgMDD = results.reduce((s, r) => s + r.maxDrawdown, 0) / count;
  const insight = getInsight(winRate, avgReturn, results);

  // 수익률 기준 최고/최악 시작일
  const bestStart = results.reduce((a, b) => a.totalReturn > b.totalReturn ? a : b);
  const worstStart = results.reduce((a, b) => a.totalReturn < b.totalReturn ? a : b);

  return (
    <div className="rolling-wrap">
      {/* 안내 문구 */}
      <div className="rolling-guide">
        <strong>롤링 분석이란?</strong> 종료일({to})을 고정한 채 시작일을 하루씩 밀어가며 반복 테스트합니다.
        막대 하나 = "이 날 시작했다면 지금쯤 수익률이 얼마였을까". 초록 막대가 많을수록 언제 시작해도 잘 되는 전략입니다.
      </div>

      {/* 설정 */}
      <div className="rolling-controls">
        <div className="rolling-control-group">
          <span className="rolling-label">시작 간격</span>
          <div className="rolling-chips">
            {STEP_OPTIONS.map(o => (
              <button key={o.value}
                className={`chip ${stepDays === o.value ? "chip-active" : ""}`}
                onClick={() => setStepDays(o.value)}>
                {o.label}
              </button>
            ))}
          </div>
        </div>
        <span className="rolling-count">{count}회 시뮬레이션 · 종료일 {to} 고정</span>
      </div>

      {/* 판정 */}
      <div className="rolling-verdict" style={{ borderColor: insight.color }}>
        <span className="rolling-verdict-label" style={{ color: insight.color }}>{insight.verdict}</span>
        <span className="rolling-verdict-detail">{insight.detail}</span>
      </div>

      {/* 통계 카드 */}
      <div className="stats-grid rolling-stats">
        <RollCard label="평균 수익률"
          value={`${avgReturn >= 0 ? "+" : ""}${avgReturn.toFixed(2)}%`}
          highlight={avgReturn >= 0 ? "positive" : "negative"} />
        <RollCard label="승률"
          value={`${winRate.toFixed(0)}%`}
          sub={`${results.filter(r => r.totalReturn > 0).length}/${count}`}
          highlight={winRate >= 50 ? "positive" : "negative"} />
        <RollCard label="최고 시작일"
          value={`+${maxReturn.toFixed(2)}%`}
          sub={bestStart.startDate}
          highlight="positive" />
        <RollCard label="최악 시작일"
          value={`${minReturn >= 0 ? "+" : ""}${minReturn.toFixed(2)}%`}
          sub={worstStart.startDate}
          highlight={minReturn >= 0 ? "positive" : "negative"} />
        <RollCard label="평균 MDD"
          value={`-${avgMDD.toFixed(2)}%`}
          highlight="negative" />
      </div>

      {/* 막대 차트 */}
      <div className="rolling-chart-wrap">
        <div className="rolling-chart-title">
          시작 시점별 수익률 (종료일 {to} 기준) — 초록: 수익, 빨강: 손실
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={results} margin={{ top: 8, right: 16, left: 0, bottom: 48 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: "#666" }}
              angle={-45}
              textAnchor="end"
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 10, fill: "#666" }}
              tickFormatter={v => `${v}%`}
            />
            <Tooltip
              contentStyle={{ background: "#1a1a2e", border: "1px solid #333", borderRadius: 8, color: "#e0e0e0" }}
              labelStyle={{ color: "#aaa" }}
              itemStyle={{ color: "#e0e0e0" }}
              formatter={(v) => [`${v >= 0 ? "+" : ""}${v.toFixed(2)}%`, "수익률"]}
              labelFormatter={(l) => `시작: 20${l}`}
            />
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.25)" />
            <Bar dataKey="totalReturn" radius={[2, 2, 0, 0]} maxBarSize={32}>
              {results.map((r, i) => (
                <Cell key={i} fill={r.totalReturn >= 0 ? "#34d399" : "#f87171"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* 추세 라인 차트 */}
      <div className="rolling-chart-wrap" style={{ marginTop: 24 }}>
        <div className="rolling-chart-title">수익률 추세선 — 시작 시점에 따른 흐름</div>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={results} margin={{ top: 8, right: 16, left: 0, bottom: 48 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: "#666" }}
              angle={-45}
              textAnchor="end"
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 10, fill: "#666" }}
              tickFormatter={v => `${v}%`}
            />
            <Tooltip
              contentStyle={{ background: "#1a1a2e", border: "1px solid #333", borderRadius: 8, color: "#e0e0e0" }}
              labelStyle={{ color: "#aaa" }}
              itemStyle={{ color: "#e0e0e0" }}
              formatter={(v, name) => name === "totalReturn" ? [`${v >= 0 ? "+" : ""}${v.toFixed(2)}%`, "수익률"] : null}
              labelFormatter={(l) => `시작: 20${l}`}
            />
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.3)" strokeDasharray="4 3" />
            {/* 양수 영역: 초록 채움 */}
            <Area type="monotone" dataKey="positiveReturn" stroke="none"
              fill="#34d399" fillOpacity={0.25} baseValue={0} legendType="none" />
            {/* 음수 영역: 빨강 채움 */}
            <Area type="monotone" dataKey="negativeReturn" stroke="none"
              fill="#f87171" fillOpacity={0.25} baseValue={0} legendType="none" />
            {/* 수익률 라인 */}
            <Area type="monotone" dataKey="totalReturn" stroke="#00d4aa"
              strokeWidth={2} fill="none" dot={false} activeDot={{ r: 4, fill: "#00d4aa" }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* 수익률 분포 박스플롯 */}
      <BoxPlotSection results={results} />

      {/* 월별 히트맵 */}
      <HeatmapSection results={results} />
    </div>
  );
}

function RollCard({ label, value, sub, highlight }) {
  return (
    <div className={`stat-card ${highlight ? `stat-${highlight}` : ""}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}
