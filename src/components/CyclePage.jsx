import { useState, useEffect, useRef } from "react";
import { fetchPrices } from "../utils/stockCache";
import { runBacktest } from "../engine/switchEngine";
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, Legend, ResponsiveContainer,
} from "recharts";

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

const EVENTS = [
  { label: "2018 무역전쟁",     from: "2018-10-01", to: "2018-12-31", type: "crash" },
  { label: "COVID 폭락",        from: "2020-02-20", to: "2020-03-18", type: "crash" },
  { label: "2022 금리인상 폭락", from: "2021-11-01", to: "2022-10-31", type: "crash" },
  { label: "엔캐리 청산",        from: "2024-07-10", to: "2024-08-05", type: "crash" },
  { label: "관세전쟁",           from: "2025-02-18", to: "2025-04-07", type: "crash" },
  { label: "COVID 반등",         from: "2020-03-18", to: "2021-11-22", type: "rally" },
  { label: "AI 반등",            from: "2022-10-13", to: "2023-07-31", type: "rally" },
  { label: "AI 랠리",            from: "2024-04-19", to: "2024-06-18", type: "rally" },
  { label: "트럼프 당선 랠리",   from: "2024-11-05", to: "2024-11-25", type: "rally" },
];

function getPeriodDates(p) {
  const to = new Date();
  const from = new Date(to);
  if (p.months) from.setMonth(from.getMonth() - p.months);
  if (p.years)  from.setFullYear(from.getFullYear() - p.years);
  return { from: toKSTDateStr(from), to: toKSTDateStr(to) };
}

const getDefaultFrom = () => {
  const d = new Date(); d.setFullYear(d.getFullYear() - 3); return toKSTDateStr(d);
};

function daysBetween(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 86400000);
}

// 똥 사이클을 후속 사이클과 합산해 에피소드로 병합
function mergeEpisodes(cycles) {
  const episodes = [];
  let i = 0;
  while (i < cycles.length) {
    const c = cycles[i];
    if (!c.dong) {
      episodes.push({ ...c, cycleNums: [c.cycleNum], dongCount: 0 });
      i++;
    } else {
      // 똥 체인 수집
      let ep = {
        cycleNums: [c.cycleNum],
        startDate: c.startDate,
        startCash: c.startCash,
        pnl: c.pnl,
        dong: true,
        dongCount: 1,
        hadVirtualBuy: c.hadVirtualBuy,
      };
      i++;
      // 연속 똥도 합산
      while (i < cycles.length && cycles[i].dong) {
        const nx = cycles[i];
        ep.cycleNums.push(nx.cycleNum);
        ep.pnl += nx.pnl;
        ep.dongCount++;
        ep.hadVirtualBuy = ep.hadVirtualBuy || nx.hadVirtualBuy;
        i++;
      }
      // 똥을 해소한 후속 사이클 흡수
      if (i < cycles.length) {
        const last = cycles[i];
        ep.cycleNums.push(last.cycleNum);
        ep.endDate = last.endDate;
        ep.pnl += last.pnl;
        ep.hadVirtualBuy = ep.hadVirtualBuy || last.hadVirtualBuy;
        i++;
      } else {
        ep.endDate = cycles[i - 1].endDate;
      }
      ep.pnlPct = (ep.pnl / ep.startCash) * 100;
      episodes.push(ep);
    }
  }
  return episodes;
}

function classifyEpisode(ep) {
  if (ep.dong) return "똥";
  if (ep.hadVirtualBuy) return "샀다치고";
  return "정상";
}

const TYPE_COLOR = { "정상": "#34d399", "샀다치고": "#facc15", "똥": "#f87171" };
const TYPE_ORDER = ["정상", "샀다치고", "똥"];

function stats(arr) {
  if (!arr.length) return { count: 0, avgReturn: null, winRate: null, avgDays: null };
  const returns = arr.map(c => c.pnlPct);
  return {
    count: arr.length,
    avgReturn: returns.reduce((s, v) => s + v, 0) / returns.length,
    winRate: returns.filter(v => v > 0).length / returns.length * 100,
    avgDays: arr.map(c => daysBetween(c.startDate, c.endDate)).reduce((s, v) => s + v, 0) / arr.length,
  };
}

function StatCard({ type, data }) {
  const color = TYPE_COLOR[type];
  return (
    <div className="cycle-stat-card" style={{ borderColor: color }}>
      <div className="cycle-stat-type" style={{ color }}>{type}</div>
      <div className="cycle-stat-count">{data.count}사이클</div>
      <div className="cycle-stat-row">
        <span className="cycle-stat-label">평균 수익률</span>
        <span className="cycle-stat-val" style={{ color: data.avgReturn >= 0 ? "var(--green)" : "var(--red)" }}>
          {data.avgReturn != null ? `${data.avgReturn >= 0 ? "+" : ""}${data.avgReturn.toFixed(2)}%` : "-"}
        </span>
      </div>
      <div className="cycle-stat-row">
        <span className="cycle-stat-label">승률</span>
        <span className="cycle-stat-val">{data.winRate != null ? `${data.winRate.toFixed(0)}%` : "-"}</span>
      </div>
      <div className="cycle-stat-row">
        <span className="cycle-stat-label">평균 기간</span>
        <span className="cycle-stat-val">{data.avgDays != null ? `${Math.round(data.avgDays)}일` : "-"}</span>
      </div>
    </div>
  );
}

const ScatterTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="chart-tooltip">
      <div style={{ fontWeight: 700, marginBottom: 4 }}>사이클 #{d.cycleNum}</div>
      <div>{d.startDate} ~ {d.endDate}</div>
      <div>기간: {d.days}일</div>
      <div style={{ color: d.pnlPct >= 0 ? "var(--green)" : "var(--red)" }}>
        수익률: {d.pnlPct >= 0 ? "+" : ""}{d.pnlPct.toFixed(2)}%
      </div>
      <div style={{ color: TYPE_COLOR[d.type], marginTop: 4 }}>{d.type}</div>
    </div>
  );
};

// 행동 문자열에서 표시용 뱃지 생성
function ActionBadge({ action }) {
  if (!action || action === "-") return <span style={{ color: "var(--muted)" }}>-</span>;
  const parts = action.split(" / ");
  return (
    <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {parts.map((p, i) => {
        let color = "var(--muted)";
        if (p.includes("업다운 매수")) color = "#60a5fa";
        else if (p.includes("업다운 매도")) color = "var(--green)";
        else if (p.includes("샀다치고")) color = "#facc15";
        else if (p.includes("똥")) color = "#f87171";
        else if (p.includes("랭크 매수")) color = "#a78bfa";
        else if (p.includes("랭크 매도")) color = "#34d399";
        return <span key={i} style={{ color, fontSize: 11 }}>{p}</span>;
      })}
    </span>
  );
}

// 사이클 일별 히스토리 모달
function CycleDetail({ cycle, dailyLog, type, onClose, panelRef, prefix = "$" }) {
  useEffect(() => {
    panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [cycle]);

  // 날짜 범위로 필터 (cycleNum은 종료일 당일에 이미 +1되므로 신뢰 불가)
  const logs = dailyLog.filter(d => d.date >= cycle.startDate && d.date <= cycle.endDate);
  const color = TYPE_COLOR[type];
  const label = cycle.cycleNums.length === 1
    ? `사이클 #${cycle.cycleNums[0]}`
    : `사이클 #${cycle.cycleNums[0]}–#${cycle.cycleNums[cycle.cycleNums.length - 1]}`;

  return (
    <div className="cycle-detail-panel" ref={panelRef}>
      <div className="cycle-modal-header">
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span className="cycle-modal-title">{label}</span>
          <span className="cycle-modal-badge" style={{ background: color + "22", color }}>
            {type}{cycle.dongCount > 0 ? ` (똥 ${cycle.dongCount}회)` : ""}
          </span>
          <span className="cycle-modal-meta">
            {cycle.startDate} ~ {cycle.endDate} &nbsp;|&nbsp; {daysBetween(cycle.startDate, cycle.endDate)}일
            &nbsp;|&nbsp;
            {prefix}{Math.round(cycle.startCash).toLocaleString()}
            &nbsp;→&nbsp;
            {prefix}{Math.round(cycle.startCash + cycle.pnl).toLocaleString()}
            &nbsp;(
            <span style={{ color: cycle.pnlPct >= 0 ? "var(--green)" : "var(--red)", fontWeight: 700 }}>
              {cycle.pnl >= 0 ? "+" : ""}{prefix}{Math.round(Math.abs(cycle.pnl)).toLocaleString()}
              &nbsp;/&nbsp;
              {cycle.pnlPct >= 0 ? "+" : ""}{cycle.pnlPct.toFixed(2)}%
            </span>
            )
          </span>
        </div>
        <button className="cycle-modal-close" onClick={onClose}>✕</button>
      </div>
      <div className="cycle-detail-body">
        <table className="cycle-log-table">
          <thead>
            <tr>
              <th>날짜</th>
              <th>종가</th>
              <th>행동</th>
              <th>포랭</th>
              <th>포트</th>
              <th>랭크</th>
              <th>LP</th>
              <th>평가액</th>
              <th>수익률</th>
            </tr>
          </thead>
          <tbody>
            {logs.map(d => (
              <tr key={d.date} className={
                d.updownBuy ? "log-row-buy"
                : d.updownSell ? "log-row-sell"
                : d.virtualBuy ? "log-row-virtual"
                : ""
              }>
                <td className="log-date">{d.date.slice(2)}</td>
                <td className="log-num">{d.close.toFixed(2)}</td>
                <td><ActionBadge action={d.action} /></td>
                <td className="log-num">{d.porang}</td>
                <td className="log-num">{d.port}</td>
                <td className="log-num">{d.rank}</td>
                <td className="log-num log-muted">{d.lp ? d.lp.toFixed(2) : "-"}</td>
                <td className="log-num log-muted">{Math.round(d.totalValue).toLocaleString()}</td>
                <td className="log-num" style={{ color: d.totalValue >= cycle.startCash ? "var(--green)" : "var(--red)" }}>
                  {(() => { const r = (d.totalValue / cycle.startCash - 1) * 100; return `${r >= 0 ? "+" : ""}${r.toFixed(2)}%`; })()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function CyclePage() {
  const [symbol, setSymbol] = useState("SOXL");
  const [from, setFrom] = useState(getDefaultFrom());
  const [to, setTo] = useState(todayKST());
  const [investment, setInvestment] = useState(String(DEFAULT_USD));
  const [porang, setPorang] = useState("15");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [cycles, setCycles] = useState(null);
  const [dailyLog, setDailyLog] = useState(null);
  const [selected, setSelected] = useState(null); // { cycle, type }
  const detailPanelRef = useRef(null);

  const prefix = isKoreanSymbol(symbol) ? "₩" : "$";

  async function handleRun() {
    if (!symbol || !from || !to) return;
    setLoading(true);
    setError(null);
    setSelected(null);
    try {
      const lb = new Date(from);
      lb.setDate(lb.getDate() - 7);
      const data = await fetchPrices(symbol.toUpperCase(), lb.toISOString().split("T")[0], to);
      if (data.prices.length < 5) throw new Error("해당 기간 데이터가 부족합니다.");
      const inv = Number(investment) || DEFAULT_USD;
      const p = Math.max(1, Math.min(30, Number(porang) || 15));
      const result = runBacktest(data.prices, inv, from, p);
      setCycles(mergeEpisodes(result.cycles));
      setDailyLog(result.dailyLog);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const grouped = cycles
    ? TYPE_ORDER.reduce((acc, t) => {
        acc[t] = cycles.filter(ep => classifyEpisode(ep) === t);
        return acc;
      }, {})
    : null;

  const scatterData = cycles
    ? TYPE_ORDER.map(t => ({
        type: t,
        color: TYPE_COLOR[t],
        points: (grouped[t] || []).map(ep => ({
          ...ep,
          days: daysBetween(ep.startDate, ep.endDate),
          type: t,
        })),
      }))
    : [];

  return (
    <section className="rolling-page">
      <div className="section-title">
        사이클 분석
        <span className="section-sub">정상 종료 · 샀다치고 · 똥 발생 사이클 수익률 패턴 비교</span>
      </div>

      <div className="rolling-form">
        <div className="event-chips">
          {EVENTS.map(e => (
            <button key={e.label}
              className={`chip event-chip event-chip-${e.type}`}
              onClick={() => { setFrom(e.from); setTo(e.to); }}>
              {e.label}
            </button>
          ))}
        </div>
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
            <label className="rolling-form-label">분할</label>
            <input className="input porang-input" type="number" value={porang}
              onChange={e => setPorang(e.target.value)} min={1} max={30} />
          </div>
          <button className="run-btn" onClick={handleRun} disabled={loading}>
            {loading ? "로딩 중..." : "▶ 분석 실행"}
          </button>
        </div>
        {error && <div className="error-box"><span className="error-icon">⚠</span> {error}</div>}
      </div>

      {cycles && (
        <>
          <div className="cycle-stat-grid">
            {TYPE_ORDER.map(t => (
              <StatCard key={t} type={t} data={stats(grouped[t] || [])} />
            ))}
          </div>

          <div className="sens-section">
            <div className="sens-section-title">사이클 기간 vs 수익률</div>
            <div className="sens-guide">각 점은 사이클 1개. X축=기간(일), Y축=사이클 수익률(%). 색상으로 타입 구분.</div>
            <ResponsiveContainer width="100%" height={380}>
              <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="days" name="기간" unit="일" type="number"
                  label={{ value: "사이클 기간 (일)", position: "insideBottom", offset: -10, fill: "var(--text-muted)", fontSize: 12 }}
                  tick={{ fill: "var(--text-muted)", fontSize: 11 }} />
                <YAxis dataKey="pnlPct" name="수익률" unit="%"
                  tick={{ fill: "var(--text-muted)", fontSize: 11 }} />
                <ReferenceLine y={0} stroke="rgba(255,255,255,0.25)" strokeDasharray="4 4" />
                <Tooltip content={<ScatterTooltip />} />
                <Legend wrapperStyle={{ paddingTop: 16, fontSize: 13 }} />
                {scatterData.map(({ type, color, points }) => (
                  <Scatter key={type} name={type} data={points} fill={color} fillOpacity={0.75} />
                ))}
              </ScatterChart>
            </ResponsiveContainer>
          </div>

          <div className="cycle-dist-grid">
            {TYPE_ORDER.map(t => {
              const items = grouped[t] || [];
              if (!items.length) return null;
              const sorted = [...items].sort((a, b) => b.pnlPct - a.pnlPct);
              return (
                <div key={t} className="cycle-dist-col">
                  <div className="cycle-dist-title" style={{ color: TYPE_COLOR[t] }}>{t} ({items.length})</div>
                  <div className="cycle-dist-list">
                    {sorted.map(ep => (
                      <div key={ep.cycleNums[0]} className="cycle-dist-row cycle-dist-row-clickable"
                        onClick={() => setSelected({ cycle: ep, type: t })}>
                        <span className="cycle-dist-date">
                          {ep.startDate.slice(2)} ~<br />{ep.endDate.slice(2)}
                          {ep.dongCount > 0 && <span style={{ color: "#f87171", fontSize: 10 }}> 똥{ep.dongCount}회</span>}
                        </span>
                        <span className="cycle-dist-return" style={{ color: ep.pnlPct >= 0 ? "var(--green)" : "var(--red)" }}>
                          {ep.pnlPct >= 0 ? "+" : ""}{ep.pnlPct.toFixed(2)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {!cycles && (
        <div className="rolling-empty" style={{ marginTop: 40 }}>
          설정을 입력하고 분석을 실행하세요.
        </div>
      )}

      {selected && dailyLog && (
        <CycleDetail
          cycle={selected.cycle}
          dailyLog={dailyLog}
          type={selected.type}
          onClose={() => setSelected(null)}
          panelRef={detailPanelRef}
          prefix={prefix}
        />
      )}
    </section>
  );
}
