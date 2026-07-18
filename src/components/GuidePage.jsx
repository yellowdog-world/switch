export default function GuidePage({ onBack }) {
  return (
    <div className="guide-page">
      <div className="guide-page-inner">

        <div className="guide-header">
          <button className="guide-back-btn" onClick={onBack}>← 돌아가기</button>
          <div className="guide-logo">🐕</div>
          <h1 className="guide-title">이 전략이란?</h1>
          <p className="guide-subtitle">
            레버리지 ETF의 <strong>일일 변동성</strong>을 활용해<br />
            오르면 팔고, 내리면 사는 것을 반복하며 수익을 쌓는 전략입니다.
          </p>
        </div>

        {/* 핵심 용어 */}
        <section className="guide-section">
          <h2 className="guide-section-title">📚 핵심 용어</h2>
          <div className="guide-terms">
            <TermCard
              term="LP (기준가)"
              color="var(--accent)"
              desc="매수·매도 판단의 기준이 되는 가격. 상황에 따라 매일 바뀌거나 고정됩니다."
              detail={[
                "포트만 있을 때 → 매일 어제 종가로 갱신",
                "랭크(떨법)가 있을 때 → 마지막 업다운 체결가로 고정",
              ]}
            />
            <TermCard
              term="포트 (Port)"
              color="#60a5fa"
              desc="업다운 전략으로 매수한 묶음 수. 오르면 한 묶음씩 팔고, 내리면 한 묶음씩 삽니다."
              detail={["업다운 매수 → +1", "업다운 매도 → −1", "포트 = 0 이 되면 사이클 완성!"]}
            />
            <TermCard
              term="랭크 (Rank)"
              color="#f472b6"
              desc="떨법으로 매수한 묶음 수. 큰 하락 시 추가 매수, 회복하면 자동 매도."
              detail={["어제 종가−0.01 이하로 빠지면 매수", "매입가 이상 회복 시 즉시 매도"]}
            />
            <TermCard
              term="포랭 (Porang)"
              color="var(--accent2)"
              desc="포트 + 랭크의 합계. 설정한 분할 수(기본 15)에 도달하면 추가 매수를 멈춥니다."
              detail={["포랭 = 포트 + 랭크", "MAX 도달 시 → 샀다치고 (LP만 업데이트)"]}
            />
          </div>
        </section>

        {/* 업다운 전략 */}
        <section className="guide-section">
          <h2 className="guide-section-title">📈 업다운 전략 (핵심)</h2>
          <p className="guide-section-desc">
            LP(기준가)를 중심으로 오르면 팔고, 내리면 사는 것을 반복합니다.
          </p>
          <div className="guide-flow">
            <FlowStep color="#00d4aa" icon="🟢" label="매도 조건">
              오늘 종가 ≥ LP<br />
              <span className="flow-detail">→ 포트 1개 매도 (수익 실현)</span>
            </FlowStep>
            <FlowArrow />
            <FlowStep color="var(--accent)" icon="📌" label="LP 갱신">
              매도 후 LP = 오늘 종가<br />
              <span className="flow-detail">다음 매매 기준 업데이트</span>
            </FlowStep>
            <div className="flow-or">또는</div>
            <FlowStep color="#f87171" icon="🔴" label="매수 조건">
              오늘 종가 ≤ LP × (1 − 0.2% × 포랭)<br />
              <span className="flow-detail">→ 포트 1개 추가 매수</span>
            </FlowStep>
          </div>
          <div className="guide-callout">
            <span className="callout-icon">💡</span>
            <span>포랭이 높을수록 매수 기준이 더 까다로워집니다. 포랭 5 → LP 대비 −1%, 포랭 10 → −2% 하락해야 매수.</span>
          </div>
        </section>

        {/* 실전 예시 — 업다운 */}
        <section className="guide-section">
          <h2 className="guide-section-title">🔢 실전 예시 — 업다운 (투자금 $15,000 / 15분할)</h2>
          <p className="guide-section-desc">1분할 = $1,000 / 포랭이 올라갈수록 매수 기준(하락폭)이 커집니다.</p>
          <div className="guide-example-table">
            <div className="ex-row ex-header">
              <span>날짜</span><span>종가</span><span>LP</span><span>포랭</span><span>행동</span><span>현금</span>
            </div>
            <div className="ex-row">
              <span>Day 1</span><span>$10.00</span><span>$10.00</span><span className="val-blue">1</span>
              <span className="action-buy">첫날 매수 100주 @$10</span><span>$14,000</span>
            </div>
            <div className="ex-row">
              <span>Day 2</span><span>$10.20</span><span>$10.00</span><span className="val-green">0</span>
              <span className="action-sell">매도 → +$20 수익</span><span>$15,020</span>
            </div>
            <div className="ex-row">
              <span>Day 3</span><span>$9.98</span><span>$10.20</span><span className="val-blue">1</span>
              <span className="action-buy">재매수 100주 @$9.98</span><span>$14,022</span>
            </div>
            <div className="ex-row">
              <span>Day 4</span><span>$9.78</span><span>$9.98</span><span className="val-blue">2</span>
              <span className="action-buy">2차 매수 102주 @$9.78 <span className="ex-note">(포랭1 → 하락 0.2% 이상 필요)</span></span><span>$13,025</span>
            </div>
            <div className="ex-row">
              <span>Day 5</span><span>$9.58</span><span>$9.78</span><span className="val-blue">3</span>
              <span className="action-buy">3차 매수 104주 @$9.58 <span className="ex-note">(포랭2 → 하락 0.4% 이상)</span></span><span>$12,027</span>
            </div>
            <div className="ex-row ex-highlight">
              <span>Day 6</span><span>$9.80</span><span>$9.58</span><span className="val-blue">2</span>
              <span className="action-sell">포트 1개 매도 → 수익 실현</span><span>$13,048</span>
            </div>
          </div>
          <div className="guide-callout">
            <span className="callout-icon">🔄</span>
            <span>포트가 0이 될 때까지 이 과정을 반복합니다. 포트=0 이 되면 <strong>한 사이클 완성!</strong></span>
          </div>
        </section>

        {/* 샀다치고 예시 */}
        <section className="guide-section">
          <h2 className="guide-section-title">🎭 샀다치고 — 실전 예시</h2>
          <p className="guide-section-desc">
            포랭이 MAX(15)에 도달한 이후에도 하락이 계속되면, 실제 매수 없이 <strong>LP만 낮은 가격으로 업데이트</strong>합니다.
            이렇게 해야 반등 시 매도 기준이 낮아져 더 빨리 매도 기회가 생깁니다.
          </p>
          <div className="guide-example-table">
            <div className="ex-row ex-header">
              <span>날짜</span><span>종가</span><span>LP</span><span>포랭</span><span>행동</span><span>현금</span>
            </div>
            <div className="ex-row">
              <span>Day 14</span><span>$7.20</span><span>$7.34</span><span className="val-warn">14</span>
              <span className="action-buy">14차 매수 138주 @$7.20</span><span>$1,012</span>
            </div>
            <div className="ex-row">
              <span>Day 15</span><span>$7.05</span><span>$7.20</span><span className="val-warn">15</span>
              <span className="action-buy">15차 매수 141주 @$7.05 — 포랭 MAX!</span><span>$0</span>
            </div>
            <div className="ex-row ex-virtual">
              <span>Day 16</span><span>$6.90</span><span className="val-warn">$7.05</span><span className="val-warn">15</span>
              <span className="action-virtual">샀다치고 — LP만 $6.90으로 업데이트</span><span>$0</span>
            </div>
            <div className="ex-row ex-virtual">
              <span>Day 17</span><span>$6.72</span><span className="val-warn">$6.90</span><span className="val-warn">15</span>
              <span className="action-virtual">샀다치고 — LP만 $6.72로 업데이트</span><span>$0</span>
            </div>
            <div className="ex-row ex-highlight">
              <span>Day 18</span><span>$6.85</span><span>$6.72</span><span className="val-blue">14</span>
              <span className="action-sell">포트 1개 매도 — LP 덕분에 반등 즉시 매도</span><span>$1,003</span>
            </div>
          </div>
          <div className="guide-callout">
            <span className="callout-icon">💡</span>
            <span>샀다치고가 없었다면 LP는 $7.05 그대로라, $7.05 이상 올라야 매도됩니다. LP를 계속 낮춰줬기 때문에 $6.85에도 즉시 매도 가능합니다.</span>
          </div>
          <div className="guide-callout" style={{ marginTop: 8 }}>
            <span className="callout-icon">⚠️</span>
            <span>샀다치고가 많을수록 하락 구간에서 현금이 바닥났다는 뜻입니다. 분할 수를 늘리거나 시작 시점을 조정해보세요.</span>
          </div>
        </section>

        {/* 떨법 */}
        <section className="guide-section">
          <h2 className="guide-section-title">📉 떨법 (랭크) — 급락 대응</h2>
          <p className="guide-section-desc">
            주가가 전날보다 크게 빠질 때 별도 묶음을 추가로 매수합니다.
            랭크 묶음은 매입가 이상 회복하면 즉시 매도됩니다.
          </p>
          <div className="guide-flow">
            <FlowStep color="#f472b6" icon="📉" label="떨법 매수">
              오늘 종가 ≤ 어제 종가 − 0.01<br />
              <span className="flow-detail">→ 랭크 +1 (1묶음 매수)</span>
            </FlowStep>
            <FlowArrow />
            <FlowStep color="#4ade80" icon="📈" label="떨법 매도">
              오늘 종가 ≥ 랭크 매입가<br />
              <span className="flow-detail">→ 랭크 −1 (수익 실현)</span>
            </FlowStep>
          </div>
          <div className="guide-callout">
            <span className="callout-icon">⚠️</span>
            <span>랭크 묶음이 있는 동안엔 LP가 마지막 업다운 체결가로 <strong>고정</strong>됩니다. 랭크를 모두 처리해야 LP 갱신이 재개됩니다.</span>
          </div>
        </section>

        {/* 사이클과 똥 */}
        <section className="guide-section">
          <h2 className="guide-section-title">🔁 사이클과 똥 이월</h2>
          <div className="guide-cycle-grid">
            <div className="guide-cycle-card">
              <div className="cycle-card-icon">✅</div>
              <h3>정상 사이클</h3>
              <p>업다운 매도로 <strong>포트 = 0</strong> 이 되고 랭크도 없으면 사이클 완성.</p>
              <p>사이클 수익률 = <code>(종료 현금 − 시작 현금) ÷ 시작 현금</code></p>
            </div>
            <div className="guide-cycle-card guide-cycle-dong">
              <div className="cycle-card-icon">⚠️</div>
              <h3>똥 이월 사이클</h3>
              <p>포트 = 0 이 됐지만 <strong>랭크 묶음이 아직 남아있는</strong> 경우.</p>
              <p>이월된 랭크 묶음을 <strong>다음 사이클이 원가에 넘겨받아</strong> 처리합니다.</p>
              <p>이번 사이클 수익 = 업다운 손익만 반영 (랭크 원가를 다음에 전달)</p>
            </div>
          </div>
        </section>

        {/* 주의사항 */}
        <section className="guide-section guide-section-warning">
          <h2 className="guide-section-title">⚠️ 투자 주의사항</h2>
          <ul className="guide-warning-list">
            <li>이 도구는 <strong>과거 데이터 기반 시뮬레이션</strong>이며, 미래 수익을 보장하지 않습니다.</li>
            <li>레버리지 ETF는 장기 보유 시 <strong>추적 오차</strong>가 발생할 수 있습니다.</li>
            <li>백테스트 성과가 좋은 기간을 의도적으로 선택하면 <strong>과최적화</strong>가 됩니다.</li>
            <li>실제 투자 결정은 <strong>본인 판단과 책임</strong> 하에 이루어져야 합니다.</li>
          </ul>
        </section>

        <div className="guide-footer">
          <button className="guide-start-btn" onClick={onBack}>이해했어요, 시작하기 →</button>
        </div>
      </div>
    </div>
  );
}

function TermCard({ term, color, desc, detail }) {
  return (
    <div className="term-card" style={{ "--term-color": color }}>
      <div className="term-name" style={{ color }}>{term}</div>
      <div className="term-desc">{desc}</div>
      <ul className="term-detail">
        {detail.map((d, i) => <li key={i}>{d}</li>)}
      </ul>
    </div>
  );
}

function FlowStep({ color, icon, label, children }) {
  return (
    <div className="flow-step" style={{ "--flow-color": color }}>
      <div className="flow-icon">{icon}</div>
      <div className="flow-label" style={{ color }}>{label}</div>
      <div className="flow-body">{children}</div>
    </div>
  );
}

function FlowArrow() {
  return <div className="flow-arrow">↔</div>;
}
