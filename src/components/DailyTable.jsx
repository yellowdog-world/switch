import { useState } from "react";

export default function DailyTable({ dailyLog }) {
  const [show, setShow] = useState(false);
  const [filter, setFilter] = useState("all");

  const filtered = dailyLog.filter(d => {
    if (filter === "action") return d.action !== "-";
    if (filter === "buy") return d.updownBuy || d.tteobBuy;
    if (filter === "sell") return d.updownSell || d.tteobSellCount > 0;
    return true;
  });

  return (
    <section className="table-section">
      <div className="table-header">
        <h2 className="section-title" style={{ margin: 0 }}>일별 로그</h2>
        <button className="toggle-btn" onClick={() => setShow(!show)}>
          {show ? "접기 ▲" : "펼치기 ▼"}
        </button>
      </div>

      {show && (
        <>
          <div className="filter-bar">
            {[["all", "전체"], ["action", "거래일만"], ["buy", "매수"], ["sell", "매도"]].map(([k, l]) => (
              <button
                key={k}
                className={`chip ${filter === k ? "chip-active" : ""}`}
                onClick={() => setFilter(k)}
              >
                {l}
              </button>
            ))}
            <span className="row-count">{filtered.length}행</span>
          </div>

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>날짜</th>
                  <th>종가</th>
                  <th>LP</th>
                  <th>포트</th>
                  <th>랭크</th>
                  <th>포랭</th>
                  <th>평가액</th>
                  <th>수익률</th>
                  <th>액션</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((d, i) => (
                  <tr key={i} className={d.action !== "-" ? "row-active" : ""}>
                    <td>{d.date}</td>
                    <td>${d.close.toFixed(2)}</td>
                    <td>{d.lp ? `$${d.lp.toFixed(2)}` : "-"}</td>
                    <td className={d.port > 0 ? "val-blue" : ""}>{d.port}</td>
                    <td className={d.rank > 0 ? "val-pink" : ""}>{d.rank}</td>
                    <td className={d.porang > 10 ? "val-warn" : ""}>{d.porang}</td>
                    <td>${d.totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                    <td className={d.returnPct >= 0 ? "val-green" : "val-red"}>
                      {d.returnPct >= 0 ? "+" : ""}{d.returnPct.toFixed(2)}%
                    </td>
                    <td className="action-cell">{d.action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
