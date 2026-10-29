// 預設語系與有開的語系是站台設定：別人的站可能是「預設英文、只開英文與日文」。
// 錯了的症狀是整站的網址、hreflang、語系選單一起指錯地方，畫面上不會有任何錯誤訊息。
import { afterEach, describe, expect, it } from 'vite-plus/test';

import {
  buildAlternateLinks,
  localeFromPathname,
  localeFromPrefix,
  pickLocaleFromAcceptLanguage,
  stripLocalePrefix,
} from '@/i18n/start-i18n';
import { setSiteIdentity } from './siteIdentity';
import { defaultLocale, enabledLocales, localeOfPrefix, localePathname, prefixOf, setLocaleConfig } from './locales';

afterEach(() => setLocaleConfig('zh-TW', undefined));

describe('站台設定改成預設英文、只開英文與日文', () => {
  const english = () => {
    setLocaleConfig('en', ['ja', 'en']);
    setSiteIdentity({
      url: 'https://example.com',
      name: '站',
      author: '站',
      description: '',
      disabled_pages: [],
      email: '',
      github: '',
      default_locale: 'en',
      locales: ['en', 'ja'],
    });
  };

  it('英文不帶前綴，日文照舊；繁中變成要前綴而且沒開', () => {
    english();
    expect(defaultLocale()).toBe('en');
    expect(enabledLocales()).toEqual(['en', 'ja']);
    expect(localePathname('en', 'blog/1')).toBe('/blog/1');
    expect(localePathname('ja', 'blog/1')).toBe('/ja/blog/1');
    expect(prefixOf('zh-TW')).toBe('zh-tw');
  });

  it('預設語系自己的前綴、沒開的語系都是 404', () => {
    english();
    expect(localeOfPrefix('en')).toBeNull();
    expect(localeOfPrefix('zh-tw')).toBeNull();
    expect(localeOfPrefix('ko')).toBeNull();
    expect(localeOfPrefix('JA')).toBe('ja');
    expect(localeFromPrefix(undefined)).toBe('en');
  });

  it('從網址認語系、剝前綴', () => {
    english();
    expect(localeFromPathname('/ja/blog/1')).toBe('ja');
    expect(localeFromPathname('/blog/1')).toBe('en');
    expect(localeFromPathname('/zh-cn/blog/1')).toBe('en');
    expect(stripLocalePrefix('/ja/blog/1')).toBe('blog/1');
  });

  it('瀏覽器說繁中，但站上沒開：退回預設語系', () => {
    english();
    expect(pickLocaleFromAcceptLanguage('zh-TW,zh;q=0.9')).toBe('en');
    expect(pickLocaleFromAcceptLanguage('ja-JP')).toBe('ja');
  });

  it('hreflang 只列有開的語系，x-default 是預設語系', () => {
    english();
    const links = buildAlternateLinks('blog', 'ja');
    expect(links.map((l) => l.hrefLang).filter(Boolean)).toEqual(['en', 'ja', 'x-default']);
    expect(links.find((l) => l.hrefLang === 'x-default')?.href).toBe('https://example.com/blog');
  });

  it('預設語系一定算有開；認不得的設定退回繁中全開', () => {
    setLocaleConfig('ko', ['en']);
    expect(enabledLocales()).toEqual(['en', 'ko']);
    setLocaleConfig('fr', []);
    expect(defaultLocale()).toBe('zh-TW');
    expect(enabledLocales()).toHaveLength(5);
  });
});
