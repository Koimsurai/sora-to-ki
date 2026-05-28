import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * 把 i18next 當前語系同步到 <html lang>。
 * CSS 的 :lang(...) 規則靠這個切換 → per-locale CJK 字體棧自動套。
 * 初始化時跑一次、之後跟著 i18n.language 變動更新。
 */
export function useHtmlLang() {
  const { i18n } = useTranslation();
  useEffect(() => {
    const lang = i18n.resolvedLanguage || i18n.language || 'zh-TW';
    document.documentElement.setAttribute('lang', lang);
  }, [i18n.resolvedLanguage, i18n.language]);
}
