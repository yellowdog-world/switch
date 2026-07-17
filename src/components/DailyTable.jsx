import { useState, useRef } from "react";
import { createPortal } from "react-dom";

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

function ColTip({ label, formula, desc, example }) {
  const [pos, setPos] = useState(null);
  const thRef = useRef();
  return (
    <>
      <th
        ref={thRef}
        onMouseEnter={() => {
          const r = thRef.current.getBoundingClientRect();
          setPos({ top: r.bottom + 6, left: r.left });
        }}
        onMouseLeave={() => setPos(null)}
        style={{ cursor: "help" }}
      >
        <span className="th-tip-label">{label}</span>
      </th>
      {pos && createPortal(
        <div className="col-tip-box" style={{ top: pos.top, left: pos.left }}>
          {formula && <code className="col-tip-code">{formula}</code>}
          <div className="col-tip-desc">{desc}</div>
          {example && <div className="col-tip-example">예) {example}</div>}
        </div>,
        document.body
      )}
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
              <ColTip
                label="종가"
                desc="당일 종가. 모든 매매는 이 가격 기준으로 체결됩니다."
              />
              <ColTip
                label="LP"
                formula={"port>0 && rank=0  → yesterday.close (매일 갱신)\nlastUpdownPrice=null → yesterday.close\n그 외              → lastUpdownPrice (고정)"}
                desc="업다운 매수·매도 기준가. 포트만 있을 땐 어제 종가로 매일 갱신, 랭크가 있으면 마지막 업다운 체결가로 고정됩니다."
              />
              <ColTip
                label="포랭"
                formula="port + rankBundles.length (최대 15)"
                desc="포트 + 랭크의 합. 포랭이 MAX에 도달하면 매수 조건 충족 시 실제 매수 없이 LP만 갱신합니다 (샀다치고 모드)."
              />
              <ColTip
                label="포트"
                formula="업다운 매수 시 +1, 매도 시 -1"
                desc="업다운 보유 묶음 수. 포트 1개 = 투자금 ÷ 포랭 분량의 업다운 매수."
              />
              <ColTip
                label="랭크"
                formula="떨법 매수 시 +1, 매도 시 -1"
                desc="떨법 보유 묶음 수. 하락일에 어제종가-0.01 이하로 종가가 내려오면 묶음 1개 매수."
              />
              <ColTip
                label="평단/차이"
                formula={"평단 = totalUpdownCost / totalShares\n차이% = (close - 평단) / 평단 × 100"}
                desc="업다운 보유 주식의 평균 매입단가와 현재 종가 대비 차이율. 보유 없으면 '-'."
                example="평단 $10, 종가 $10.3 → +3.0%"
              />
              <ColTip
                label="평가액"
                formula="cash + totalShares×close + Σ(rank.shares×close)"
                desc="현금 + 업다운 보유 평가액 + 랭크 보유 평가액의 합."
              />
              <ColTip
                label="수익률"
                formula="(totalValue - investmentUSD) / investmentUSD × 100"
                desc="초기 투자금 대비 현재 전체 평가액의 증감률."
              />
              <ColTip
                label="사이클"
                formula="(cash - cycleStartCash) / cycleStartCash × 100"
                desc="업다운 전량 매도(포트=0) 시 사이클 확정. 해당 사이클 시작 현금 대비 종료 시점 현금의 변화율. 떨법·업다운 수익 모두 포함."
                example="#1 +0.03% → 첫 사이클 현금이 시작 대비 0.03% 증가"
              />
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
