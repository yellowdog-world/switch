import { useState } from "react";
import { fetchPrices } from "../utils/stockCache";
import { runSwitchCompare, runQldBuyHold } from "../engine/compareEngine";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend,
} from "recharts";

const DURATION_PRESETS = [
  { label: "1년", months: 12 },
  { label: "2년", months: 24 },
  { label: "3년", months: 36 },
  { label: "5년", months: 60 },
  { label: "7년", months: 84 },
];

const EVENT_PRESETS = [
  { label: "COVID 폭락", from: "2020-01-01", to: "2022-01-01" },
  { label: "2022 폭락기", from: "2021-11-01", to: "2023-06-01" },
  { label: "AI 랠리", from: "2023-01-01", to: "2025-01-01" },
];

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

function monthsAgo(n) {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d.toISOString().split("T")[0];
}

function sampleData(arr, max = 300) {
  if (arr.length <= max) return arr;
  const step = Math.ceil(arr.length / max);
  return arr.filter((_, i) => i % step === 0 || i === arr.length - 1);
}

export default function QldComparePage() {
  const [from, setFrom] = useState(monthsAgo(36));
  const [to, setTo] = useState(todayStr());
  const [investMode, setInvestMode] = useState("both");
  const [initialAmount, setInitialAmount] = useState(30000);
  const [monthlyAmount, setMonthlyAmount] = useState(3000);
  const [contribDay, setContribDay] = useState(10);
  const [switchSymbol, setSwitchSymbol] = useState("SOXL");
  const [compareSymbol, setCompareSymbol] = useState("QQQ");
  const [porang, setPorang] = useState(15);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  function applyDuration(months) {
    setFrom(monthsAgo(months));
    setTo(todayStr());
  }

  function applyEvent(preset) {
    setFrom(preset.from);
    setTo(preset.to);
  }

  async function handleRun() {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      // LP 계산을 위한 7일 lookback
      const d = new Date(from);
      d.setDate(d.getDate() - 7);
      const lookbackFrom = d.toISOString().split("T")[0];

      const [switchData, cmpData] = await Promise.all([
        fetchPrices(switchSymbol, lookbackFrom, to),
        fetchPrices(compareSymbol, lookbackFrom, to),
      ]);

      if (switchData.prices.length < 2) throw new Error(`${switchSymbol} 데이터가 부족합니다.`);
      if (cmpData.prices.length < 2) throw new Error(`${compareSymbol} 데이터가 부족합니다.`);

      const initialUSD = investMode === "monthly" ? 0 : Number(initialAmount);
      const monthly = investMode === "lump" ? 0 : Number(monthlyAmount);

      const opts = {
        startFrom: from,
        maxPorang: Number(porang),
        monthlyContribution: monthly,
        contributionDay: Number(contribDay),
        investMode,
      };

      const swResult = runSwitchCompare(switchData.prices, initialUSD, opts);
      const qldResult = runQldBuyHold(cmpData.prices, initialUSD, opts);

      // 날짜 교집합으로 차트 데이터 구성
      const swByDate = {};
      for (const d of swResult.dailyLog) swByDate[d.date] = d;
      const qldByDate = {};
      for (const d of qldResult.dailyLog) qldByDate[d.date] = d;

      const allDates = [...new Set([
        ...swResult.dailyLog.map(d => d.date),
        ...qldResult.dailyLog.map(d => d.date),
      ])].sort();

      const rawChart = allDates
        .filter(date => swByDate[date] && qldByDate[date])
        .map(date => ({
          date,
          switchRet: swByDate[date].returnPct,
          qldRet: qldByDate[date].returnPct,
        }));

      const mergedLog = allDates
        .filter(date => swByDate[date] || qldByDate[date])
        .map(date => ({ date, sw: swByDate[date], qld: qldByDate[date] }));

      setResult({
        swResult,
        qldResult,
        chartData: sampleData(rawChart, 300),
        mergedLog,
        switchSymbol,
        compareSymbol,
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const modeDisabled = (mode) => {
    if (mode === "initial") return investMode === "monthly";
    if (mode === "monthly") return investMode === "lump";
    return false;
  };

  return (
    <div className="compare-page">

      {/* ── 컨트롤 ── */}
      <section className="controls-section">
        <h2 className="section-title">
          {switchSymbol} 전략 vs {compareSymbol} 비교
          <span className="section-sub">월 적립 포함 누적 수익률 비교 시뮬레이션</span>
        </h2>

        <div className="compare-form">
          {/* 기간 */}
          <div className="control-group">
            <label className="control-label">기간 프리셋</label>
            <div className="quick-symbols" style={{ flexWrap: "wrap" }}>
              {DURATION_PRESETS.map(p => (
                <button key={p.label} className="chip" onClick={() => applyDuration(p.months)}>{p.label}</button>
              ))}
              {EVENT_PRESETS.map(p => (
                <button key={p.label} className="chip" onClick={() => applyEvent(p)}>{p.label}</button>
              ))}
            </div>
          </div>

          <div className="control-row-2">
            <div className="control-group">
              <label className="control-label">시작일</label>
              <input type="date" className="input" value={from} onChange={e => setFrom(e.target.value)} />
            </div>
            <div className="control-group">
              <label className="control-label">종료일</label>
              <input type="date" className="input" value={to} onChange={e => setTo(e.target.value)} />
            </div>
          </div>

          {/* 투자 방식 */}
          <div className="control-group">
            <label className="control-label">투자 방식</label>
            <div className="quick-symbols">
              {[["lump", "거치식"], ["monthly", "월 적립식"], ["both", "거치 + 월 적립"]].map(([k, l]) => (
                <button
                  key={k}
                  className={`chip ${investMode === k ? "chip-active" : ""}`}
                  onClick={() => setInvestMode(k)}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          {/* 금액 */}
          <div className="control-row-2">
            <div className="control-group">
              <label className="control-label">초기 거치금액</label>
              <div className="input-prefix-wrap">
                <span className="input-prefix">$</span>
                <input
                  type="number"
                  className="input input-prefixed"
                  value={initialAmount}
                  onChange={e => setInitialAmount(e.target.value)}
                  disabled={modeDisabled("initial")}
                  min={0}
                />
              </div>
            </div>
            <div className="control-group">
              <label className="control-label">월 적립금</label>
              <div className="input-prefix-wrap">
                <span className="input-prefix">$</span>
                <input
                  type="number"
                  className="input input-prefixed"
                  value={monthlyAmount}
                  onChange={e => setMonthlyAmount(e.target.value)}
                  disabled={modeDisabled("monthly")}
                  min={0}
                />
              </div>
            </div>
          </div>

          <div className="control-row-2">
            <div className="control-group">
              <label className="control-label">적립일</label>
              <select
                className="input"
                value={contribDay}
                onChange={e => setContribDay(Number(e.target.value))}
                disabled={modeDisabled("monthly")}
              >
                {[1, 5, 10, 15, 20, 25].map(d => (
                  <option key={d} value={d}>매월 {d}일</option>
                ))}
              </select>
            </div>
            <div className="control-group">
              <label className="control-label">전략 종목</label>
              <select className="input" value={switchSymbol} onChange={e => setSwitchSymbol(e.target.value)}>
                <option value="SOXL">SOXL</option>
                <option value="TQQQ">TQQQ</option>
              </select>
            </div>
            <div className="control-group">
              <label className="control-label">비교 대상 (보유)</label>
              <select className="input" value={compareSymbol} onChange={e => setCompareSymbol(e.target.value)}>
                <option value="QQQ">QQQ</option>
                <option value="QLD">QLD (2× QQQ)</option>
                <option value="TQQQ">TQQQ (3× QQQ)</option>
                <option value="SPY">SPY (S&amp;P 500)</option>
              </select>
            </div>
          </div>

          <div className="control-group" style={{ maxWidth: 180 }}>
            <label className="control-label">분할 수 (MAX_PORANG)</label>
            <input
              type="number"
              className="input"
              value={porang}
              onChange={e => setPorang(e.target.value)}
              min={5} max={30}
            />
          </div>

          <button className="run-btn" onClick={handleRun} disabled={loading}>
            {loading ? "계산 중..." : "▶ 비교 실행"}
          </button>
        </div>
      </section>

      {/* ── 오류 ── */}
      {error && (
        <div className="error-box"><span className="error-icon">⚠</span> {error}</div>
      )}

      {/* ── 로딩 ── */}
      {loading && (
        <div className="loading-box">
          <div className="spinner" />
          <span>데이터 로딩 및 시뮬레이션 중...</span>
        </div>
      )}

      {/* ── 결과 ── */}
      {result && (
        <>
          <CompareSummary result={result} />
          <CompareChart result={result} />
          <CompareDailyLog result={result} />
        </>
      )}
    </div>
  );
}

function CompareSummary({ result }) {
  const { swResult, qldResult, switchSymbol, compareSymbol } = result;
  const diff = swResult.totalReturn - qldResult.totalReturn;

  return (
    <section className="summary-section">
      <h2 className="section-title">비교 결과 요약</h2>
      <div className="stats-grid">
        <StatCard
          label="총 투입 원금"
          value={`$${Math.round(swResult.totalInvested).toLocaleString()}`}
          sub={`QLD 기준: $${Math.round(qldResult.totalInvested).toLocaleString()}`}
        />
        <StatCard
          label={`${switchSymbol} 전략 평가액`}
          value={`$${Math.round(swResult.finalValue).toLocaleString()}`}
          sub={`${swResult.totalReturn >= 0 ? "+" : ""}${swResult.totalReturn.toFixed(2)}%`}
          highlight={swResult.totalReturn >= 0 ? "positive" : "negative"}
        />
        <StatCard
          label={`${compareSymbol} 보유 평가액`}
          value={`$${Math.round(qldResult.finalValue).toLocaleString()}`}
          sub={`${qldResult.totalReturn >= 0 ? "+" : ""}${qldResult.totalReturn.toFixed(2)}%`}
          highlight={qldResult.totalReturn >= 0 ? "positive" : "negative"}
        />
        <StatCard
          label="수익률 차이"
          value={`${diff >= 0 ? "+" : ""}${diff.toFixed(2)}%p`}
          sub={diff >= 0 ? `전략이 ${compareSymbol} 대비 우위` : `${compareSymbol}이 전략 대비 우위`}
          highlight={diff >= 0 ? "positive" : "negative"}
        />
      </div>
    </section>
  );
}

function StatCard({ label, value, sub, highlight }) {
  return (
    <div className={`stat-card ${highlight ? `stat-${highlight}` : ""}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

function CompareChart({ result }) {
  const { chartData, switchSymbol, compareSymbol } = result;

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div style={{ background: "var(--bg3)", border: "1px solid var(--border2)", borderRadius: 8, padding: "10px 14px", fontSize: 12 }}>
        <div style={{ color: "var(--muted)", marginBottom: 6 }}>{label}</div>
        {payload.map(p => (
          <div key={p.dataKey} style={{ color: p.color, marginBottom: 2 }}>
            {p.name}: {p.value != null ? `${p.value >= 0 ? "+" : ""}${p.value.toFixed(2)}%` : "-"}
          </div>
        ))}
      </div>
    );
  };

  return (
    <section className="charts-section">
      <h2 className="section-title">누적 수익률 추이</h2>
      <div className="chart-wrap">
        <ResponsiveContainer width="100%" height={360}>
          <LineChart data={chartData} margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis
              dataKey="date"
              tick={{ fill: "#666", fontSize: 10 }}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fill: "#666", fontSize: 10 }}
              tickLine={false}
              tickFormatter={v => `${v.toFixed(0)}%`}
              width={52}
            />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine y={0} stroke="#333" strokeDasharray="4 4" />
            <Legend
              wrapperStyle={{ color: "#888", fontSize: 12, paddingTop: 12 }}
            />
            <Line
              type="monotone"
              dataKey="switchRet"
              stroke="#60a5fa"
              strokeWidth={2}
              dot={false}
              name={`${switchSymbol} 전략`}
            />
            <Line
              type="monotone"
              dataKey="qldRet"
              stroke="#f59e0b"
              strokeWidth={2}
              dot={false}
              name={`${compareSymbol} 보유`}
              strokeDasharray="6 3"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function CompareDailyLog({ result }) {
  const [filter, setFilter] = useState("action");
  const { mergedLog, switchSymbol, compareSymbol } = result;

  const filtered = mergedLog.filter(d => {
    const sw = d.sw;
    if (filter === "action") {
      return sw && (
        sw.updownBuy || sw.updownSell || sw.virtualBuy ||
        sw.tteobBuy || sw.tteobSells > 0 || sw.isContribDay ||
        d.qld?.isContribDay
      );
    }
    if (filter === "contrib") return sw?.isContribDay || d.qld?.isContribDay;
    return true;
  });

  return (
    <section className="table-section">
      <div className="table-header">
        <h2 className="section-title" style={{ marginBottom: 0 }}>일별 현황</h2>
      </div>
      <div className="filter-bar">
        {[["action", "거래·적립일"], ["contrib", "적립일만"], ["all", "전체"]].map(([k, l]) => (
          <button
            key={k}
            className={`chip ${filter === k ? "chip-active" : ""}`}
            onClick={() => setFilter(k)}
          >
            {l}
          </button>
        ))}
        <span className="row-count">{filtered.length.toLocaleString()}행</span>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>날짜</th>
              <th>{switchSymbol} 종가</th>
              <th>전략 평가액</th>
              <th>전략 수익률</th>
              <th>{compareSymbol} 종가</th>
              <th>{compareSymbol} 평가액</th>
              <th>{compareSymbol} 수익률</th>
              <th>비고</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(d => {
              const sw = d.sw;
              const qld = d.qld;
              const swPos = (sw?.returnPct ?? 0) >= 0;
              const qldPos = (qld?.returnPct ?? 0) >= 0;
              const isContrib = sw?.isContribDay || qld?.isContribDay;

              const badges = [];
              if (isContrib) badges.push(<span key="c" className="badge-contrib">💰 적립</span>);
              if (sw?.updownBuy) badges.push(<span key="b" className="badge-buy">매수</span>);
              if (sw?.updownSell) badges.push(<span key="s" className="badge-sell">매도</span>);
              if (sw?.virtualBuy) badges.push(<span key="v" className="badge-virtual">샀다치고</span>);
              if (sw?.tteobBuy) badges.push(<span key="t" className="badge-tteob">떨법</span>);

              return (
                <tr key={d.date} className={isContrib ? "row-contrib" : ""}>
                  <td>{d.date}</td>
                  <td>{sw ? `$${sw.close.toFixed(2)}` : "-"}</td>
                  <td>{sw ? `$${Math.round(sw.totalValue).toLocaleString()}` : "-"}</td>
                  <td className={swPos ? "val-green" : "val-red"}>
                    {sw ? `${swPos ? "+" : ""}${sw.returnPct.toFixed(2)}%` : "-"}
                  </td>
                  <td>{qld ? `$${qld.close.toFixed(2)}` : "-"}</td>
                  <td>{qld ? `$${Math.round(qld.totalValue).toLocaleString()}` : "-"}</td>
                  <td className={qldPos ? "val-green" : "val-red"}>
                    {qld ? `${qldPos ? "+" : ""}${qld.returnPct.toFixed(2)}%` : "-"}
                  </td>
                  <td style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{badges}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
