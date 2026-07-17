// 캐시 키 버전: API 응답 형식이 바뀌거나 버그 수정 후 구 캐시를 무효화해야 할 때 올림
// (예: period2 +1일 버그 수정 후 v1→v2로 올려서 잘못된 캐시 자동 폐기)
const PREFIX = "yd_stock_v2_";

// sessionStorage를 쓰는 이유: 같은 탭 안에서 동일 종목/기간 재조회 시 API 재호출 방지.
// 탭을 닫으면 자동으로 초기화되므로 오래된 데이터가 남을 걱정이 없음.
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
