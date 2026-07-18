import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

function stockApiPlugin() {
  return {
    name: 'stock-api',
    configureServer(server) {
      server.middlewares.use('/api/stock', async (req, res) => {
        const url = new URL(req.url, 'http://localhost');
        const symbol = url.searchParams.get('symbol');
        const from = url.searchParams.get('from');
        const to = url.searchParams.get('to');

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');

        if (!symbol || !from || !to) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'symbol, from, to 파라미터가 필요합니다.' }));
          return;
        }

        const period1 = Math.floor(new Date(from).getTime() / 1000);
        const toDate = new Date(to);
        toDate.setDate(toDate.getDate() + 1);
        const period2 = Math.floor(toDate.getTime() / 1000);

        const yUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${period1}&period2=${period2}&interval=1d&events=history`;

        try {
          const response = await fetch(yUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Accept': 'application/json',
            },
          });

          if (!response.ok) {
            res.statusCode = response.status;
            res.end(JSON.stringify({ error: `Yahoo Finance 오류: ${response.statusText}` }));
            return;
          }

          const data = await response.json();
          const result = data?.chart?.result?.[0];

          if (!result) {
            res.statusCode = 404;
            res.end(JSON.stringify({ error: '데이터를 찾을 수 없습니다.' }));
            return;
          }

          const timestamps = result.timestamp;
          const closes = result.indicators.quote[0].close;
          const meta = result.meta;
          const symbolName = meta.longName || meta.shortName || symbol;

          const prices = timestamps.map((ts, i) => ({
            date: new Date(ts * 1000).toISOString().split('T')[0],
            close: closes[i] ? parseFloat(closes[i].toFixed(4)) : null,
          })).filter(p => p.close !== null);

          res.statusCode = 200;
          res.end(JSON.stringify({ symbol, symbolName, prices }));
        } catch (err) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: err.message }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), stockApiPlugin()],
});
