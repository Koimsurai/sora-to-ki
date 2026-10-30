// 精靈走到哪一步、設定碼與還沒存的答案，記在這個分頁的 sessionStorage：
// 認領站長要跳去 GitHub／Google 登入再回來，整頁會重新載入，靠這份接著走。
// 不放 localStorage：設定碼不該在瀏覽器裡留得比這個分頁久。

export const STEPS = ['owner', 'lang', 'site', 'pages', 'done'] as const;
export type Step = 'gate' | (typeof STEPS)[number];

export interface Draft {
  default_locale: string;
  locales: string[];
  name: string;
  author: string;
  description: string;
  email: string;
  github: string;
  disabled_pages: string[];
}

export interface InitSession {
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

/** 站台設定的欄位上限，跟後端 handlers/site_config.rs 一致 */
const LIMITS = { name: 60, description: 300, email: 120, github: 39 } as const;

export type SiteProblem =
  | { field: 'name'; key: 'nameRequired' | 'nameTooLong'; max?: number }
  | { field: 'author'; key: 'authorTooLong'; max: number }
  | { field: 'description'; key: 'descriptionTooLong'; max: number }
  | { field: 'email'; key: 'email' }
  | { field: 'github'; key: 'github' };

/** 「站台」那一步擋得住的錯，規則照後端的 `apply`（那邊一樣會擋，這裡只是早一點說） */
export function siteProblems(d: Draft): SiteProblem[] {
  const out: SiteProblem[] = [];
  const len = (s: string) => Array.from(s.trim()).length;
  if (!d.name.trim()) out.push({ field: 'name', key: 'nameRequired' });
  else if (len(d.name) > LIMITS.name) out.push({ field: 'name', key: 'nameTooLong', max: LIMITS.name });
  if (len(d.author) > LIMITS.name) out.push({ field: 'author', key: 'authorTooLong', max: LIMITS.name });
  if (len(d.description) > LIMITS.description)
    out.push({ field: 'description', key: 'descriptionTooLong', max: LIMITS.description });
  const email = d.email.trim();
  if (email && (!email.includes('@') || len(email) > LIMITS.email)) out.push({ field: 'email', key: 'email' });
  const github = d.github
    .trim()
    .replace(/^https:\/\/github\.com\//, '')
    .replace(/^@/, '')
    .replace(/\/$/, '');
  if (github && (!/^[A-Za-z0-9-]+$/.test(github) || github.length > LIMITS.github))
    out.push({ field: 'github', key: 'github' });
  return out;
}
