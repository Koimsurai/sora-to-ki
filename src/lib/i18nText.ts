import { defaultLocale } from './locales';

/**
 * 站長填的多語文字（語系 → 字）挑出這個語系的那一份。
 * 沒填（或填了空字串）就退回預設語系，再沒有就隨便一個有填的——寧可顯示別的語言，也不要空著。
 */
export function pickText(text: Partial<Record<string, string>> | undefined, lang: string): string {
  if (!text) return '';
  const candidates = [text[lang], text[defaultLocale()], ...Object.values(text)];
  return candidates.find((v): v is string => typeof v === 'string' && v !== '') ?? '';
}
