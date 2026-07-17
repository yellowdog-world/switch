export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { symbol, from, to } = req.query;

  if (!symbol || !from || !to) {
    return res.status(400).json({ error: 'symbol, from, to 파라미터가 필요합니다.' });
  }

  const period1 = Math.floor(new Date(from).getTime() / 1000);

  // Yahoo Finance의 period2는 exclusive(해당 날짜 제외)라서
  // to 날짜의 데이터를 포함하려면 +1일을 해줘야 함.
  // 예: to=2026-07-17이면 period2를 7/18로 설정해야 7/17 종가가 내려옴.
  const toDate = new Date(to);
  toDate.setDate(toDate.getDate() + 1);
  const period2 = Math.floor(toDate.getTime() / 1000);

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${period1}&period2=${period2}&interval=1d&events=history`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: `Yahoo Finance 오류: ${response.statusText}` });
    }

    const data = await response.json();
    const result = data?.chart?.result?.[0];

    if (!result) {
      return res.status(404).json({ error: '데이터를 찾을 수 없습니다.' });
    }

    const timestamps = result.timestamp;
    const closes = result.indicators.quote[0].close;
    const meta = result.meta;
    const symbolName = meta.longName || meta.shortName || symbol;

    const prices = timestamps.map((ts, i) => ({
      date: new Date(ts * 1000).toISOString().split('T')[0],
      close: closes[i] ? parseFloat(closes[i].toFixed(4)) : null,
    })).filter(p => p.close !== null);

    return res.status(200).json({ symbol, symbolName, prices });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
