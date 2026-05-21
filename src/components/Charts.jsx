import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend, Cell
} from "recharts";
import { useState } from "react";
import DailyTable from "./DailyTable";

export default function Charts({ dailyLog, cycles }) {
  const [tab, setTab] = useState("return");

  // 날짜 샘플링 (너무 많으면 느림)
  const sampled = sampleData(dailyLog, 300);

  const tabs = [
    { key: "return", label: "수익률 추이" },
    { key: "porang", label: "포랭/LP 변화" },
    { key: "cycle", label: "사이클별 손익" },
    { key: "daily", label: "일별 현황" },
  ];

  return (
    <section className="charts-section">
      <div className="tab-bar">
        {tabs.map(t => (
          <button
            key={t.key}
            className={`tab-btn ${tab === t.key ? "tab-active" : ""}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="chart-wrap">
        {tab === "return" && <ReturnChart data={sampled} />}
        {tab === "porang" && <PorangChart data={sampled} />}
        {tab === "cycle" && <CycleChart cycles={cycles} />}
        {tab === "daily" && <DailyTable dailyLog={dailyLog} />}
      </div>
    </section>
  );
}

function ReturnChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={360}>
      <LineChart data={data} margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
        <XAxis dataKey="date" tick={{ fill: "#888", fontSize: 11 }} tickLine={false} interval="preserveStartEnd" />
        <YAxis tick={{ fill: "#888", fontSize: 11 }} tickLine={false} tickFormatter={v => `${v.toFixed(1)}%`} />
        <Tooltip
          contentStyle={{ background: "#1a1a2e", border: "1px solid #333", borderRadius: 8, color: "#e0e0e0" }}
          labelStyle={{ color: "#aaa" }}
          itemStyle={{ color: "#e0e0e0" }}
          formatter={(v) => [`${v.toFixed(2)}%`, "수익률"]}
        />
        <ReferenceLine y={0} stroke="#444" strokeDasharray="4 4" />
        <Line
          type="monotone"
          dataKey="returnPct"
          stroke="#00d4aa"
          strokeWidth={2}
          dot={false}
          name="수익률"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

function PorangChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={360}>
      <LineChart data={data} margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
        <XAxis dataKey="date" tick={{ fill: "#888", fontSize: 11 }} tickLine={false} interval="preserveStartEnd" />
        <YAxis yAxisId="left" tick={{ fill: "#888", fontSize: 11 }} tickLine={false} />
        <YAxis yAxisId="right" orientation="right" tick={{ fill: "#888", fontSize: 11 }} tickLine={false} tickFormatter={v => `$${v.toFixed(0)}`} />
        <Tooltip
          contentStyle={{ background: "#1a1a2e", border: "1px solid #333", borderRadius: 8, color: "#e0e0e0" }}
          labelStyle={{ color: "#aaa" }}
          itemStyle={{ color: "#e0e0e0" }}
        />
        <Legend wrapperStyle={{ color: "#aaa", fontSize: 12 }} />
        <Line yAxisId="left" type="stepAfter" dataKey="porang" stroke="#f59e0b" strokeWidth={2} dot={false} name="포랭" />
        <Line yAxisId="left" type="stepAfter" dataKey="port" stroke="#60a5fa" strokeWidth={1.5} dot={false} name="포트" strokeDasharray="4 2" />
        <Line yAxisId="left" type="stepAfter" dataKey="rank" stroke="#f472b6" strokeWidth={1.5} dot={false} name="랭크" strokeDasharray="4 2" />
        <Line yAxisId="right" type="monotone" dataKey="lp" stroke="#a78bfa" strokeWidth={1.5} dot={false} name="LP($)" />
      </LineChart>
    </ResponsiveContainer>
  );
}

function CycleChart({ cycles }) {
  if (!cycles.length) return <div className="no-data">사이클 데이터 없음</div>;

  return (
    <ResponsiveContainer width="100%" height={360}>
      <BarChart data={cycles} margin={{ top: 10, right: 20, bottom: 30, left: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
        <XAxis
          dataKey="cycleNum"
          tick={{ fill: "#888", fontSize: 11 }}
          tickLine={false}
          label={{ value: "사이클 #", position: "insideBottom", offset: -15, fill: "#666", fontSize: 12 }}
          tickFormatter={v => `#${v}`}
        />
        <YAxis tick={{ fill: "#888", fontSize: 11 }} tickLine={false} tickFormatter={v => `${v.toFixed(1)}%`} />
        <Tooltip
          contentStyle={{ background: "#1a1a2e", border: "1px solid #333", borderRadius: 8, color: "#e0e0e0" }}
          labelStyle={{ color: "#aaa" }}
          itemStyle={{ color: "#e0e0e0" }}
          formatter={(v, name, props) => [
            `${v.toFixed(2)}%${props.payload.dong ? " ⚠️똥" : ""}`,
            "수익률"
          ]}
          labelFormatter={v => `사이클 #${v}`}
        />
        <ReferenceLine y={0} stroke="#444" />
        <Bar dataKey="pnlPct" radius={[4, 4, 0, 0]} name="사이클 손익률">
          {cycles.map((entry, i) => (
            <Cell
              key={i}
              fill={entry.dong ? "#f59e0b" : entry.pnlPct >= 0 ? "#00d4aa" : "#f87171"}
              opacity={0.85}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function sampleData(data, maxPoints) {
  if (data.length <= maxPoints) return data;
  const step = Math.ceil(data.length / maxPoints);
  return data.filter((_, i) => i % step === 0 || i === data.length - 1);
}
