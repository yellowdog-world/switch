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

export default function RollingChart({ prices, investment, maxPorang, from, to }) {
  const [stepDays, setStepDays] = useState(7);

  const results = useMemo(() => {
    if (!prices || prices.length < 10 || !from || !to) return [];

    const dates = prices.map(p => p.date); // 정렬된 거래일 배열
    const out = [];

    // 시작일 후보: from부터 step씩 증가, to보다 MIN_TRADING_DAYS 거래일 이상 남아야 함
    let curObj = new Date(from);
    const toStr = to;

    while (true) {
      const curStr = curObj.toISOString().split("T")[0];
      if (curStr >= toStr) break;

      // curStr 이후 거래일이 MIN_TRADING_DAYS개 이상 남아 있는지 확인
      const remaining = dates.filter(d => d >= curStr && d <= toStr);
      if (remaining.length < MIN_TRADING_DAYS) break;

      // to 이하 prices만 사용 (이미 prices는 to까지 데이터를 담고 있음)
      const result = runBacktest(prices, investment, curStr, maxPorang);

      out.push({
        startDate: curStr,
        label: curStr.slice(2, 10), // YY-MM-DD로 짧게
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
    return (
      <div className="rolling-empty">
        백테스트를 먼저 실행해주세요.
      </div>
    );
  }

  const count = results.length;
  if (count === 0) {
    return (
      <div className="rolling-empty">
        테스트 가능한 시작 시점이 없습니다. 더 긴 기간으로 백테스트를 실행해주세요.
      </div>
    );
  }

  // 통계
  const avgReturn = results.reduce((s, r) => s + r.totalReturn, 0) / count;
  const minReturn = Math.min(...results.map(r => r.totalReturn));
  const maxReturn = Math.max(...results.map(r => r.totalReturn));
  const winRate = results.filter(r => r.totalReturn > 0).length / count * 100;
  const avgMDD = results.reduce((s, r) => s + r.maxDrawdown, 0) / count;

  return (
    <div className="rolling-wrap">
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
        <span className="rolling-count">{count}회 시뮬레이션 (종료일 {to} 고정)</span>
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
        <RollCard label="최고 수익률"
          value={`+${maxReturn.toFixed(2)}%`}
          highlight="positive" />
        <RollCard label="최저 수익률"
          value={`${minReturn >= 0 ? "+" : ""}${minReturn.toFixed(2)}%`}
          highlight={minReturn >= 0 ? "positive" : "negative"} />
        <RollCard label="평균 MDD"
          value={`-${avgMDD.toFixed(2)}%`}
          highlight="negative" />
      </div>

      {/* 수익률 분포 차트 */}
      <div className="rolling-chart-wrap">
        <div className="rolling-chart-title">
          시작 시점별 수익률 — 종료일 {to} 기준
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
              contentStyle={{
                background: "#1a1a2e",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 8,
                fontSize: 12,
              }}
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
