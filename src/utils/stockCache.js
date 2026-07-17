const PREFIX = "yd_stock_v2_";

export async function fetchPrices(symbol, from, to) {
  const key = `${PREFIX}${symbol}_${from}_${to}`;
  const cached = sessionStorage.getItem(key);
  if (cached) return JSON.parse(cached);

  const res = await fetch(
    `/api/stock?symbol=${encodeURIComponent(symbol)}&from=${from}&to=${to}`
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "데이터 로드 실패");
  if (!data.prices?.length) throw new Error("데이터 없음");

  sessionStorage.setItem(key, JSON.stringify(data));
  return data;
}
