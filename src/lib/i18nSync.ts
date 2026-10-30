// 多語欄位的譯文跟不跟得上原文。
//
// 站長改了原文（預設語系），別的語系不會自己跟著改，前台就會一邊是新的、一邊是舊的（2026-10 的關於頁就是這樣）。
// 所以每次在後台寫某個語系的譯文，就在同一個欄位裡記下「那時候原文長什麼樣」的指紋（保留 key `_src`，
// 格式 `en:1a2b3c4d,ja:…`）。之後原文改了、指紋對不上，那個語系就是「可能過期」。
//
// 沒有指紋的譯文（這個機制之前寫的）當作跟得上：猜不出它是對著哪一版翻的，全部標起來只會是一片雜訊。

export const SYNC_KEY = '_src';

type Text = Partial<Record<string, string>>;

/** 原文的指紋：FNV-1a 32 位，8 個十六進位字。只拿來比對「改過沒」，不需要防碰撞 */
export function fingerprint(text: string): string {
  let h = 0x811c9dc5;
  for (const ch of text.trim()) {
    h ^= ch.codePointAt(0) ?? 0;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

function readSync(value: Text | undefined): Partial<Record<string, string>> {
  const raw = value?.[SYNC_KEY] ?? '';
  return Object.fromEntries(
    raw
      .split(',')
      .map((pair) => pair.split(':'))
      .filter((p): p is [string, string] => p.length === 2 && p[0] !== '' && p[1] !== ''),
  );
}

function writeSync(sync: Partial<Record<string, string>>): string {
  return Object.entries(sync)
    .flatMap(([l, f]) => (f ? [`${l}:${f}`] : []))
    .join(',');
}

/** 這個語系的譯文有沒有可能過期：有譯文、有指紋、而且跟現在的原文對不上 */
export function isStale(value: Text | undefined, lang: string, base: string): boolean {
  if (lang === base) return false;
  const translated = value?.[lang]?.trim();
  const source = value?.[base]?.trim();
  if (!translated || !source) return false;
  const was = readSync(value)[lang];
  return was !== undefined && was !== fingerprint(source);
}

/** 記下「這個語系現在是對著這一版原文翻的」（改譯文、或按「已對過」的時候） */
export function markSynced<T extends Text>(value: T, lang: string, base: string): T {
  if (lang === base) return value;
  const sync = readSync(value);
  const source = value[base]?.trim();
  if (source) sync[lang] = fingerprint(source);
  else delete sync[lang];
  const next: Text = { ...value, [SYNC_KEY]: writeSync(sync) };
  if (next[SYNC_KEY] === '') delete next[SYNC_KEY];
  return next as T;
}

/** 走過整份頁面內容，數出每個語系有幾格可能過期（語系分頁旁邊的數字） */
export function staleCounts(content: unknown, langs: readonly string[], base: string): Record<string, number> {
  const counts: Record<string, number> = Object.fromEntries(langs.map((l) => [l, 0]));
  const walk = (node: unknown) => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (!node || typeof node !== 'object') return;
    const obj = node as Record<string, unknown>;
    // 多語欄位：有原文那個 key、值都是字串
    if (typeof obj[base] === 'string' && Object.values(obj).every((v) => typeof v === 'string')) {
      for (const l of langs) if (isStale(obj as Text, l, base)) counts[l] += 1;
      return;
    }
    Object.values(obj).forEach(walk);
  };
  walk(content);
  return counts;
}
