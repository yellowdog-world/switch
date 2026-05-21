# Switch Method Backtest

스위치법(업다운 + 떨법) 전략 백테스트 웹앱

## 기능
- Yahoo Finance에서 주가 데이터 자동 수집
- 스위치법 로직 시뮬레이션 (업다운 + 떨법 + 똥 이월)
- 수익률 추이 / 포랭·LP 변화 / 사이클별 손익 차트
- 일별 거래 로그 테이블

## Vercel 배포 방법

### 1. GitHub에 올리기
```bash
git init
git add .
git commit -m "initial"
git remote add origin https://github.com/YOUR_ID/switch-backtest.git
git push -u origin main
```

### 2. Vercel 연결
1. https://vercel.com 접속 → New Project
2. GitHub 레포 선택
3. Framework: Vite 자동 감지
4. Deploy 클릭

### 3. 배포 완료
- 자동으로 URL 생성 (예: `switch-backtest.vercel.app`)
- 친구에게 링크 공유!

## 로컬 실행
```bash
npm install
npm run dev
```

## 스위치법 설정값
| 항목 | 값 |
|------|-----|
| 최대 포랭 | 15 |
| 1회 매수금액 | 투자금 ÷ 15 |
| 업다운 매수조건 | LP × (1 - 0.2% × 포랭) |
| 첫날 진입조건 | 어제종가 × 110% 이내 |
| 떨법 주문가 | 어제종가 - $0.01 |
