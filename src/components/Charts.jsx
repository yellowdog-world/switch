import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend, Cell
} from "recharts";
import { useState } from "react";
import { fetchPrices } from "../utils/stockCache";
import DailyTable from "./DailyTable";

const COMPARE_COLORS = ["#a78bfa", "#fb923c", "#38bdf8", "#f472b6", "#4ade80"];

export default function Charts({ dailyLog, cycles, symbol, symbolName }) {
  const [tab, setTab] = useState("daily");

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
        {tab === "return" && <ReturnChart data={sampled} symbol={symbol} symbolName={symbolName || symbol} />}
        {tab === "porang" && <PorangChart data={sampled} />}
        {tab === "cycle" && <CycleChart cycles={cycles} />}
        {tab === "daily" && <DailyTable dailyLog={dailyLog} />}
      </div>
    </section>
  );
}

function ReturnChart({ data, symbol, symbolName }) {
  const [showSwitch, setShowSwitch] = useState(true);
  const [showBuyHold, setShowBuyHold] = useState(true);
  const [compareSymbols, setCompareSymbols] = useState([]);
  const [compareData, setCompareData] = useState({});
  const [inputSymbol, setInputSymbol] = useState("");
  const [loadingSymbol, setLoadingSymbol] = useState(null);
  const [compareError, setCompareError] = useState(null);

  const firstClose = data[0]?.close;

  const chartData = data.map(d => {
    const row = {
      ...d,
      buyHoldPct: firstClose != null
        ? parseFloat(((d.close - firstClose) / firstClose * 100).toFixed(2))
        : 0,
    };
    compareSymbols.forEach(sym => {
      const cd = compareData[sym];
      if (cd?.filledMap[d.date] != null) {
        row[`cmp_${sym}`] = parseFloat(
          ((cd.filledMap[d.date] - cd.firstClose) / cd.firstClose * 100).toFixed(2)
        );
      }
    });
    return row;
  });

  async function addCompare(rawSym) {
    const sym = rawSym.trim().toUpperCase();
    if (!sym || compareSymbols.includes(sym) || compareSymbols.length >= 5) return;
    setLoadingSymbol(sym);
    setCompareError(null);
    try {
      const fromDate = new Date(data[0].date);
      fromDate.setDate(fromDate.getDate() - 7);
      const lookbackFrom = fromDate.toISOString().split("T")[0];
      const to = data[data.length - 1].date;

      const json = await fetchPrices(sym, lookbackFrom, to);

      const startDate = data[0].date;
      const startIdx = json.prices.findIndex(p => p.date >= startDate);
      const fc = (startIdx >= 0 ? json.prices[startIdx] : json.prices[0]).close;

      const sorted = [...json.prices].sort((a, b) => a.date.localeCompare(b.date));
      const filledMap = {};
      let pi = 0;
      let last = null;
      for (const row of data) {
        while (pi < sorted.length && sorted[pi].date <= row.date) {
          last = sorted[pi].close;
          pi++;
        }
        if (last != null) filledMap[row.date] = last;
      }

      setCompareData(prev => ({ ...prev, [sym]: { filledMap, firstClose: fc, name: json.symbolName || sym } }));
      setCompareSymbols(prev => [...prev, sym]);
      setInputSymbol("");
    } catch (e) {
      setCompareError(e.message);
    }
    setLoadingSymbol(null);
  }

  function removeCompare(sym) {
    setCompareSymbols(prev => prev.filter(s => s !== sym));
    setCompareData(prev => { const n = { ...prev }; delete n[sym]; return n; });
  }

  return (
    <div>
      <div className="chart-legend-bar">
        <button
          className={`legend-chip ${showSwitch ? "legend-on" : "legend-off"}`}
          style={{ "--chip-color": "#00d4aa", ...(showSwitch && { background: "#00d4aa1a" }) }}
          onClick={() => setShowSwitch(v => !v)}
        >
          <span className="legend-dot" style={{ background: showSwitch ? "#00d4aa" : undefined }} />
          스위치 수익률
        </button>
        <button
          className={`legend-chip ${showBuyHold ? "legend-on" : "legend-off"}`}
          style={{ "--chip-color": "#f59e0b", ...(showBuyHold && { background: "#f59e0b1a" }) }}
          onClick={() => setShowBuyHold(v => !v)}
        >
          <span className="legend-dot" style={{ background: showBuyHold ? "#f59e0b" : undefined }} />
          {symbolName} 보유
        </button>
        {compareSymbols.map((sym, i) => {
          const color = COMPARE_COLORS[i % COMPARE_COLORS.length];
          return (
            <span
              key={sym}
              className="legend-chip legend-on"
              style={{ "--chip-color": color, background: `${color}1a` }}
            >
              <span className="legend-dot" style={{ background: color }} />
              {compareData[sym]?.name || sym} 보유
              <button className="legend-remove" onClick={() => removeCompare(sym)}>×</button>
            </span>
          );
        })}
        <div className="compare-input-wrap">
          <input
            className="compare-input"
            value={inputSymbol}
            onChange={e => { setInputSymbol(e.target.value.toUpperCase()); setCompareError(null); }}
            onKeyDown={e => e.key === "Enter" && addCompare(inputSymbol)}
            placeholder="비교 종목 추가..."
            disabled={!!loadingSymbol || compareSymbols.length >= 5}
          />
          <button
            className="compare-add-btn"
            onClick={() => addCompare(inputSymbol)}
            disabled={!!loadingSymbol || !inputSymbol.trim()}
          >
            {loadingSymbol ? "…" : "+"}
          </button>
        </div>
        {compareError && <span className="compare-error">{compareError}</span>}
      </div>

      <ResponsiveContainer width="100%" height={360}>
        <LineChart data={chartData} margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
          <XAxis dataKey="date" tick={{ fill: "#888", fontSize: 11 }} tickLine={false} interval="preserveStartEnd" />
          <YAxis tick={{ fill: "#888", fontSize: 11 }} tickLine={false} tickFormatter={v => `${v.toFixed(1)}%`} />
          <Tooltip
            contentStyle={{ background: "#1a1a2e", border: "1px solid #333", borderRadius: 8, color: "#e0e0e0" }}
            labelStyle={{ color: "#aaa" }}
            itemStyle={{ color: "#e0e0e0" }}
            formatter={(v, name) => [v != null ? `${v.toFixed(2)}%` : "-", name]}
          />
          <ReferenceLine y={0} stroke="#444" strokeDasharray="4 4" />
          {showSwitch && (
            <Line type="monotone" dataKey="returnPct" stroke="#00d4aa" strokeWidth={2} dot={false} name="스위치 수익률" />
          )}
          {showBuyHold && (
            <Line type="monotone" dataKey="buyHoldPct" stroke="#f59e0b" strokeWidth={1.5} dot={false} name={`${symbolName} 보유`} strokeDasharray="5 3" />
          )}
          {compareSymbols.map((sym, i) => (
            <Line
              key={sym}
              type="monotone"
              dataKey={`cmp_${sym}`}
              stroke={COMPARE_COLORS[i % COMPARE_COLORS.length]}
              strokeWidth={1.5}
              dot={false}
              name={`${compareData[sym]?.name || sym} 보유`}
              strokeDasharray="5 3"
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function PorangChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={360}>
      <LineChart data={data} margin={{ top: 10, right: 50, bottom: 10, left: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
        <XAxis dataKey="date" tick={{ fill: "#888", fontSize: 11 }} tickLine={false} interval="preserveStartEnd" />
        <YAxis yAxisId="left" tick={{ fill: "#888", fontSize: 11 }} tickLine={false} domain={[0, 15]} />
        <YAxis yAxisId="right" orientation="right" tick={{ fill: "#888", fontSize: 11 }} tickLine={false} tickFormatter={v => `${v.toFixed(0)}%`} domain={[0, 100]} />
        <Tooltip
          contentStyle={{ background: "#1a1a2e", border: "1px solid #333", borderRadius: 8, color: "#e0e0e0" }}
          labelStyle={{ color: "#aaa" }}
          itemStyle={{ color: "#e0e0e0" }}
          formatter={(v, name) => name === "투자금 소진" ? [`${v.toFixed(1)}%`, name] : [v, name]}
        />
        <Legend wrapperStyle={{ color: "#aaa", fontSize: 12 }} />
        <Line yAxisId="left" type="stepAfter" dataKey="porang" stroke="#f59e0b" strokeWidth={2} dot={false} name="포랭" />
        <Line yAxisId="left" type="stepAfter" dataKey="port" stroke="#60a5fa" strokeWidth={1.5} dot={false} name="포트" strokeDasharray="4 2" />
        <Line yAxisId="left" type="stepAfter" dataKey="rank" stroke="#f472b6" strokeWidth={1.5} dot={false} name="랭크" strokeDasharray="4 2" />
        <Line yAxisId="right" type="monotone" dataKey="cashUsedPct" stroke="#34d399" strokeWidth={2} dot={false} name="투자금 소진" strokeDasharray="6 2" />
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
