import { useMemo, useState } from "react";
import { runBacktest } from "../engine/switchEngine";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
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

      out.push({
        startDate: curStr,
        label: curStr.slice(2, 10), // YY-MM-DD
        totalReturn: result.summary.totalReturn,
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

      {/* 차트 */}
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
