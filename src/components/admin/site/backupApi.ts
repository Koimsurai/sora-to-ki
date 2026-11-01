import { at } from '@/i18n/admin-i18n';
import { apiErrorText } from '@/lib/apiError';

// 備份還原的兩個步驟（後端 handlers/backup.rs）：後台的備份段與精靈的搬家共用

/** 上傳一份備份。成功回 `null`，失敗回給人看的訊息 */
export async function uploadBackup(url: string, file: File, headers: Record<string, string>): Promise<string | null> {
  try {
    const res = await fetch(url, { method: 'POST', headers, body: file });
    if (res.ok) return null;
    return apiErrorText(await res.json().catch(() => ({})), at, 'errors', `${res.status}`);
  } catch {
    return at('common.offline');
  }
}

/** 後端重開：先等它斷掉，再等它回來（最多兩分鐘） */
export async function waitForRestart(): Promise<void> {
  const up = async () => {
    try {
      return (await fetch('/api/init/status', { cache: 'no-store' })).ok;
    } catch {
      return false;
    }
  };
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 20 && (await up()); i++) await sleep(500);
  for (let i = 0; i < 120 && !(await up()); i++) await sleep(1000);
}
