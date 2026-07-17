import { useMemo, useState } from "react";
import { runBacktest } from "../engine/switchEngine";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer, Cell,
} from "recharts";

const WINDOW_OPTIONS = [
  { value: 1, label: "1개월" },
  { value: 3, label: "3개월" },
  { value: 6, label: "6개월" },
  { value: 12, label: "1년" },
  { value: 24, label: "2년" },
  { value: 36, label: "3년" },
  { value: 60, label: "5년" },
];

// stepDays: 실제로 며칠씩 시작점을 밀지
const STEP_OPTIONS = [
  { value: 1,  label: "1일" },
  { value: 7,  label: "1주" },
  { value: 14, label: "2주" },
  { value: 28, label: "4주" },
];

// 날짜 기준으로 prices를 슬라이딩하며 runBacktest를 반복 호출.
// 각 창의 수익률 분포를 통해 "어느 시점에 시작해도 이 전략이 통하는가"를 검증.
export default function RollingChart({ prices, investment, maxPorang }) {
  const [windowMonths, setWindowMonths] = useState(12);
  const [stepDays, setStepDays] = useState(28);

  const results = useMemo(() => {
    if (!prices || prices.length < 5) return [];

    const dates = prices.map(p => p.date); // 이미 정렬된 거래일 배열
    const out = [];
    let startIdx = 0;

    while (startIdx < dates.length) {
      const startDate = dates[startIdx];

      // 창 종료일 = 시작일 + windowMonths (달력 기준)
      const endDateObj = new Date(startDate);
      endDateObj.setMonth(endDateObj.getMonth() + windowMonths);
      const endDateStr = endDateObj.toISOString().split("T")[0];

      // 종료일이 보유 데이터 범위를 벗어나면 종료
      if (endDateStr > dates[dates.length - 1]) break;

      // endDateStr 이하의 마지막 인덱스 탐색
      let endIdx = dates.length - 1;
      for (let j = startIdx; j < dates.length; j++) {
        if (dates[j] > endDateStr) { endIdx = j - 1; break; }
      }
      if (endIdx < startIdx) break;

      // 해당 창의 prices만 잘라서 백테스트 실행
      // startDate 이전 데이터는 lookback 용도로 유지됨(prices[0]부터 포함)
      const windowPrices = prices.slice(0, endIdx + 1);
      const result = runBacktest(windowPrices, investment, startDate, maxPorang);

      out.push({
        startDate,
        endDate: dates[endIdx],
        label: startDate.slice(0, 7), // 차트 레이블: YYYY-MM
        totalReturn: result.summary.totalReturn,
        maxDrawdown: result.summary.maxDrawdown,
        totalCycles: result.summary.totalCycles,
        dongCount: result.summary.dongCount,
        virtualBuyCount: result.summary.virtualBuyCount ?? 0,
      });

      // stepDays일 후의 첫 거래일로 이동
      const nextObj = new Date(startDate);
      nextObj.setDate(nextObj.getDate() + stepDays);
      const nextStr = nextObj.toISOString().split("T")[0];
      const nextIdx = dates.findIndex(d => d >= nextStr);
      if (nextIdx === -1 || nextIdx <= startIdx) break;
      startIdx = nextIdx;
    }

    return out;
  }, [prices, investment, maxPorang, windowMonths, stepDays]);

  // 데이터 부족
  if (!prices || prices.length < 10) {
    return (
      <div className="rolling-empty">
        데이터가 부족합니다. 더 긴 기간으로 백테스트를 먼저 실행해주세요.
      </div>
    );
  }

  const count = results.length;

  // 통계
  const avgReturn = count ? results.reduce((s, r) => s + r.totalReturn, 0) / count : 0;
  const minReturn = count ? Math.min(...results.map(r => r.totalReturn)) : 0;
  const maxReturn = count ? Math.max(...results.map(r => r.totalReturn)) : 0;
  const winRate = count ? results.filter(r => r.totalReturn > 0).length / count * 100 : 0;
  const avgMDD = count ? results.reduce((s, r) => s + r.maxDrawdown, 0) / count : 0;

  return (
    <div className="rolling-wrap">
      {/* 설정 */}
      <div className="rolling-controls">
        <div className="rolling-control-group">
          <span className="rolling-label">창 크기</span>
          <div className="rolling-chips">
            {WINDOW_OPTIONS.map(o => (
              <button key={o.value}
                className={`chip ${windowMonths === o.value ? "chip-active" : ""}`}
                onClick={() => setWindowMonths(o.value)}>
                {o.label}
              </button>
            ))}
          </div>
        </div>
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
        {count > 0 && (
          <span className="rolling-count">{count}회 시뮬레이션</span>
        )}
      </div>

      {count === 0 && (
        <div className="rolling-empty">
          선택한 창 크기({WINDOW_OPTIONS.find(o => o.value === windowMonths)?.label})보다
          백테스트 기간이 짧습니다. 더 긴 기간으로 실행하거나 창 크기를 줄여주세요.
        </div>
      )}

      {count > 0 && (
        <>
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
              시작 시점별 수익률 — {WINDOW_OPTIONS.find(o => o.value === windowMonths)?.label} 보유
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
                  formatter={(v, _, props) => [
                    `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`,
                    `${props.payload.startDate} ~ ${props.payload.endDate}`,
                  ]}
                  labelFormatter={() => ""}
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
        </>
      )}
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
