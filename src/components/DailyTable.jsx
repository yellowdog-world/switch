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

// 컬럼 헤더에 마우스오버 툴팁을 붙이는 컴포넌트.
// createPortal로 document.body에 렌더링하는 이유:
//   .table-wrap에 overflow-x:auto가 있어서 position:absolute 툴팁이 잘려 보임.
//   Portal로 body에 직접 붙이면 overflow 클리핑 없이 항상 화면 위에 뜸.
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

// maxPorang: 사용자가 설정한 분할 수. 포랭 경고색 기준(70%)을 동적으로 계산하기 위해 받음.
export default function DailyTable({ dailyLog, maxPorang = 15, symbol = "SOXL" }) {
  const [filter, setFilter] = useState("all");
  const prefix = symbol.endsWith(".KS") ? "₩" : "$";
  const firstLog = dailyLog[0];
  const lastLog = dailyLog[dailyLog.length - 1];
  const totalPnl = lastLog.totalValue - firstLog.totalValue;
  const totalPnlPct = (totalPnl / firstLog.totalValue) * 100;

  const filtered = dailyLog.filter(d => {
    if (filter === "action") return d.action !== "-";
    if (filter === "buy") return d.updownBuy || d.virtualBuy || d.tteobBuy;
    if (filter === "sell") return d.updownSell || d.tteobSellCount > 0;
    return true;
  });

  return (
    <>
      <div className="backtest-period-summary">
        <span>{prefix}{Math.round(firstLog.totalValue).toLocaleString()}</span>
        <span className="bps-arrow">→</span>
        <span>{prefix}{Math.round(lastLog.totalValue).toLocaleString()}</span>
        <span className="bps-pnl" style={{ color: totalPnl >= 0 ? "var(--green)" : "var(--red)" }}>
          ({totalPnl >= 0 ? "+" : ""}{prefix}{Math.round(Math.abs(totalPnl)).toLocaleString()}
          &nbsp;/&nbsp;
          {totalPnlPct >= 0 ? "+" : ""}{totalPnlPct.toFixed(2)}%)
        </span>
      </div>
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
                formula="(totalValue - cycleStartCash) / cycleStartCash × 100"
                desc="해당 사이클 시작 시점 원금 대비 현재 전체 평가액의 증감률."
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
                {/* 포랭이 설정값의 70% 이상이면 경고색. 예: 15분할이면 11 이상 */}
                <td className={d.porang >= maxPorang * 0.7 ? "val-warn" : ""}>{d.porang}</td>
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
                {(() => {
                  // 사이클 종료일: cycleEndPnlPct(이월 원가 기준)로 badge와 일치시킴
                  //   → 이월 주식을 원가로 다음 사이클에 넘긴 것으로 가정한 평가액
                  //   → displayValue = cash + iweolCost = cycleStartCash_next (다음 사이클 시작 원금과 동일)
                  // 그 외: totalValue 기준 사이클 수익률
                  const returnPct = d.cycleEndPnlPct !== null
                    ? d.cycleEndPnlPct
                    : (d.totalValue / d.cycleStartCash - 1) * 100;
                  const displayValue = d.cycleEndPnlPct !== null
                    ? Math.round(d.cycleStartCash * (1 + d.cycleEndPnlPct / 100))
                    : d.totalValue;
                  return (
                    <>
                      <td>${Math.round(displayValue).toLocaleString()}</td>
                      <td className={returnPct >= 0 ? "val-green" : "val-red"}>
                        {`${returnPct >= 0 ? "+" : ""}${returnPct.toFixed(2)}%`}
                      </td>
                    </>
                  );
                })()}
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
