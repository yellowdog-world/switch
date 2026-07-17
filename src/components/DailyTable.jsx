import { useState } from "react";

function ActionText({ action }) {
  if (!action || action === "-") return <span className="action-dash">-</span>;
  const parts = action.split(" / ");
  return (
    <>
      {parts.map((part, i) => {
        let cls = "action-neutral";
        if (part.includes("샀다치고")) cls = "action-virtual";
        else if (part.includes("매수")) cls = "action-buy";
        else if (part.includes("매도")) cls = "action-sell";
        else if (part.includes("이월")) cls = "action-warn";
        return (
          <span key={i}>
            {i > 0 && <span className="action-sep"> / </span>}
            <span className={cls}>{part}</span>
          </span>
        );
      })}
    </>
  );
}

export default function DailyTable({ dailyLog }) {
  const [filter, setFilter] = useState("all");

  const filtered = dailyLog.filter(d => {
    if (filter === "action") return d.action !== "-";
    if (filter === "buy") return d.updownBuy || d.virtualBuy || d.tteobBuy;
    if (filter === "sell") return d.updownSell || d.tteobSellCount > 0;
    return true;
  });

  return (
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
              <th>포랭</th>
              <th>포트</th>
              <th>랭크</th>
              <th>평단/차이</th>
              <th>평가액</th>
              <th>수익률</th>
              <th>사이클</th>
              <th>액션</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((d, i) => (
              <tr key={i} className={d.cycleEndPnlPct !== null ? "row-cycle-end" : d.action !== "-" ? "row-active" : ""}>
                <td>{d.date}</td>
                <td>${d.close.toFixed(2)}</td>
                <td>{d.lp ? `$${d.lp.toFixed(2)}` : "-"}</td>
                <td className={d.porang > 10 ? "val-warn" : ""}>{d.porang}</td>
                <td className={d.port > 0 ? "val-blue" : ""}>{d.port}</td>
                <td className={d.rank > 0 ? "val-pink" : ""}>{d.rank}</td>
                <td>
                  {d.avgCost != null ? (
                    <span>
                      {d.avgCost.toFixed(2)}
                      <br />
                      <span className={((d.close - d.avgCost) / d.avgCost * 100) >= 0 ? "val-green" : "val-red"}>
                        {((d.close - d.avgCost) / d.avgCost * 100) >= 0 ? "+" : ""}{((d.close - d.avgCost) / d.avgCost * 100).toFixed(1)}%
                      </span>
                    </span>
                  ) : "-"}
                </td>
                <td>${d.totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                <td className={d.returnPct >= 0 ? "val-green" : "val-red"}>
                  {d.returnPct >= 0 ? "+" : ""}{d.returnPct.toFixed(2)}%
                </td>
                <td>
                  {d.cycleEndPnlPct !== null ? (
                    <span className={`cycle-badge ${d.cycleEndPnlPct >= 0 ? "cycle-pos" : "cycle-neg"}`}>
                      #{d.cycleEndNum} {d.cycleEndPnlPct >= 0 ? "+" : ""}{d.cycleEndPnlPct.toFixed(2)}%
                    </span>
                  ) : (
                    <span className="cycle-num">#{d.cycleNum}</span>
                  )}
                </td>
                <td className="action-cell"><ActionText action={d.action} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
