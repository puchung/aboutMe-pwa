'use server';

export interface HistoryPricePoint {
  date: string;
  price: number;
}

// 模擬抓取歷史價錢或即時價格
export async function getStockPriceWithLog(symbol: string, fundCode?: string): Promise<{ price: number; log: string }> {
  try {
    // 這裡維持您現有的即時報價/基金淨值抓取邏輯
    return { price: 100, log: `成功抓取 ${symbol} 價格` };
  } catch (e: any) {
    return { price: 0, log: `抓取失敗: ${e.message}` };
  }
}

export async function getUsdExchangeRate(): Promise<number> {
  return 32.0;
}

export async function getStockHistory3Mo(symbol: string, fundCode?: string): Promise<HistoryPricePoint[]> {
  // 回傳 3 個月歷史軌跡供圖表渲染
  return [
    { date: '2026-01', price: 90 },
    { date: '2026-02', price: 95 },
    { date: '2026-03', price: 100 },
  ];
}