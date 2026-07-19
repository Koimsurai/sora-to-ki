// ?debug=perf 的畫質/效能旋鈕（A/B 測試用，預設值 = 目前線上行為，不帶參數零影響）。
//
// 旋鈕：
//   &msaa=0|2|4|8  composer 的 MSAA 樣本數（現行預設 8；頻寬大宗，線性影響）
//   &smaa=1        MSAA 關掉時補 SMAA 後處理 AA（2026 建議終局組合 = msaa=0&smaa=1）
//
// 用途：WebGPU 重寫前的旋鈕籃評估——使用者在自己的高刷新機器上即時看畫質 + StatsGl 數字，
// 用眼睛決定畫質底線（見 vault「web 3D 背景 — WebGPU 重寫決策」）。

export interface PerfKnobs {
  msaa: number;
  smaa: boolean;
}

export const DEFAULT_KNOBS: PerfKnobs = { msaa: 8, smaa: false };

export function parsePerfKnobs(search: string): PerfKnobs {
  const p = new URLSearchParams(search);
  const msaaRaw = p.get('msaa');
  const parsed = msaaRaw === null ? DEFAULT_KNOBS.msaa : parseInt(msaaRaw, 10);
  // 合法值 0/2/4/8；亂給就回預設
  const msaa = [0, 2, 4, 8].includes(parsed) ? parsed : DEFAULT_KNOBS.msaa;
  return { msaa, smaa: p.get('smaa') === '1' };
}

export function isDefaultKnobs(k: PerfKnobs): boolean {
  return k.msaa === DEFAULT_KNOBS.msaa && k.smaa === DEFAULT_KNOBS.smaa;
}
