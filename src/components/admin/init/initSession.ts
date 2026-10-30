import type { Draft } from '../site/siteDraft';

// 精靈走到哪一步、設定碼與還沒存的答案，記在這個分頁的 sessionStorage：
// 認領站長要跳去 GitHub／Google 登入再回來，整頁會重新載入，靠這份接著走。
// 不放 localStorage：設定碼不該在瀏覽器裡留得比這個分頁久。

export const STEPS = ['owner', 'lang', 'site', 'pages', 'done'] as const;
export type Step = 'gate' | (typeof STEPS)[number];

interface InitSession {
  code?: string;
  step?: Step;
  draft?: Draft;
}

const KEY = 'koimsurai_init';

export function readSession(): InitSession {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as InitSession) : {};
  } catch {
    return {};
  }
}

export function writeSession(patch: InitSession): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ...readSession(), ...patch }));
  } catch {
    // 存不了就只是重新整理後要從頭來
  }
}

export function clearSession(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // 同上
  }
}
