// start-i18n 純函式的單元測試：locale 解析／URL 建構／hreflang／Accept-Language
// 協商／bot 偵測，以及「每 render 獨立 i18n instance」的隔離保證（SSR 不互踩的關鍵）。
import { beforeAll, describe, expect, it } from 'vite-plus/test';

import {
  LOCALE_LABELS,
  buildAlternateLinks,
  createI18n,
  defaultPrefixTarget,
  isLocaleLoaded,
  loadLocale,
  localeFromPathname,
  localeFromPrefix,
  localeUrl,
  pickLocaleFromAcceptLanguage,
  stripLocalePrefix,
  toLocales,
} from './start-i18n';
import { isBotUserAgent } from '@/lib/bot';
import { defaultLocale, SUPPORTED_LOCALES } from '@/lib/locales';
import { setSiteIdentity } from '@/lib/siteIdentity';

// 站台身分照正式站填，下面的網址與標題才是看得懂的樣子
beforeAll(() => {
  setSiteIdentity({
    url: 'https://koimsurai.com',
    name: '宙と木',
    author: 'Koimsurai',
    description: '',
    disabled_pages: [],
    email: '',
    github: 'Koimsurai',
    default_locale: 'zh-TW',
    locales: ['zh-TW', 'zh-CN', 'en', 'ja', 'ko'],
    theme: 'saturn',
    page_descriptions: {},
    launch_pad: { lat: 23.7, lon: 121 },
  });
});

describe('localeFromPrefix', () => {
  it('無前綴 → 預設 zh-TW', () => {
    expect(localeFromPrefix(undefined)).toBe('zh-TW');
    expect(localeFromPrefix('')).toBe('zh-TW');
  });
  it('支援的前綴（大小寫不敏感）', () => {
    expect(localeFromPrefix('en')).toBe('en');
    expect(localeFromPrefix('EN')).toBe('en');
    expect(localeFromPrefix('zh-cn')).toBe('zh-CN');
    expect(localeFromPrefix('ZH-CN')).toBe('zh-CN');
  });
  it('非支援前綴 → null（路由 notFound）', () => {
    expect(localeFromPrefix('fr')).toBeNull();
    expect(localeFromPrefix('blog')).toBeNull();
  });
});

describe('localeFromPathname / stripLocalePrefix', () => {
  it('pathname 第一段決定 locale', () => {
    expect(localeFromPathname('/en/blog/39')).toBe('en');
    expect(localeFromPathname('/zh-cn/about')).toBe('zh-CN');
    expect(localeFromPathname('/blog/39')).toBe('zh-TW');
    expect(localeFromPathname('/')).toBe('zh-TW');
  });
  it('strip 只剝非預設語言的前綴', () => {
    expect(stripLocalePrefix('/en/blog/39')).toBe('blog/39');
    expect(stripLocalePrefix('/blog/39')).toBe('blog/39');
    expect(stripLocalePrefix('/en')).toBe('');
    expect(stripLocalePrefix('/')).toBe('');
  });
});

describe('defaultPrefixTarget', () => {
  it('帶著預設語系自己的前綴 → 去掉前綴的那一條', () => {
    expect(defaultPrefixTarget('/zh-tw/blog/39')).toBe('/blog/39');
    expect(defaultPrefixTarget('/ZH-TW')).toBe('/');
    expect(defaultPrefixTarget('/zh-tw/')).toBe('/');
  });
  it('其他網址不動（包括別的語系前綴、剛好也是 zh 開頭的路徑）', () => {
    expect(defaultPrefixTarget('/en/blog/39')).toBeNull();
    expect(defaultPrefixTarget('/blog/zh-tw')).toBeNull();
    expect(defaultPrefixTarget('/zh-cn/about')).toBeNull();
    expect(defaultPrefixTarget('/')).toBeNull();
  });
});

describe('toLocales', () => {
  it('空值 → 預設語言', () => {
    expect(toLocales(undefined)).toEqual([defaultLocale()]);
    expect(toLocales([])).toEqual([defaultLocale()]);
  });
  it('過濾不支援的、依 SUPPORTED_LOCALES 排序', () => {
    expect(toLocales(['ja', 'en', 'xx'])).toEqual(['en', 'ja']);
    expect(toLocales(['zh-TW', 'ko'])).toEqual(['zh-TW', 'ko']);
  });
});

describe('localeUrl / buildAlternateLinks', () => {
  it('預設語言無前綴、其餘帶前綴', () => {
    expect(localeUrl('zh-TW', '')).toBe('https://koimsurai.com/');
    expect(localeUrl('zh-TW', '/blog/39')).toBe('https://koimsurai.com/blog/39');
    expect(localeUrl('en', 'blog/39')).toBe('https://koimsurai.com/en/blog/39');
    expect(localeUrl('zh-CN', 'about')).toBe('https://koimsurai.com/zh-cn/about');
  });
  it('canonical 指當前語言、附全語言 alternates 與 x-default', () => {
    const links = buildAlternateLinks('blog/39', 'en', ['zh-TW', 'en']);
    expect(links[0]).toEqual({ rel: 'canonical', href: 'https://koimsurai.com/en/blog/39' });
    expect(links).toContainEqual({
      rel: 'alternate',
      hrefLang: 'zh-TW',
      href: 'https://koimsurai.com/blog/39',
    });
    expect(links).toContainEqual({
      rel: 'alternate',
      hrefLang: 'x-default',
      href: 'https://koimsurai.com/blog/39',
    });
    // 只列文章實際存在的語言（+canonical +x-default）
    expect(links).toHaveLength(4);
  });
});

describe('pickLocaleFromAcceptLanguage', () => {
  it('缺 header → 預設', () => {
    expect(pickLocaleFromAcceptLanguage(undefined)).toBe(defaultLocale());
    expect(pickLocaleFromAcceptLanguage(null)).toBe(defaultLocale());
  });
  it('依 q 值挑最佳支援語言', () => {
    expect(pickLocaleFromAcceptLanguage('ja,en;q=0.8')).toBe('ja');
    expect(pickLocaleFromAcceptLanguage('en;q=0.5,ko;q=0.9')).toBe('ko');
  });
  it('中文變體正規化', () => {
    expect(pickLocaleFromAcceptLanguage('zh-HK')).toBe('zh-TW');
    expect(pickLocaleFromAcceptLanguage('zh-Hans')).toBe('zh-CN');
    expect(pickLocaleFromAcceptLanguage('zh')).toBe('zh-TW');
  });
  it('全不支援 → 預設', () => {
    expect(pickLocaleFromAcceptLanguage('fr-FR,de;q=0.8')).toBe(defaultLocale());
  });
});

describe('isBotUserAgent', () => {
  it('爬蟲/預覽 UA → true', () => {
    expect(isBotUserAgent('Mozilla/5.0 (compatible; Googlebot/2.1)')).toBe(true);
    expect(isBotUserAgent('Discordbot/2.0')).toBe(true);
    expect(isBotUserAgent('facebookexternalhit/1.1')).toBe(true);
  });
  it('一般瀏覽器與空值 → false', () => {
    expect(
      isBotUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36',
      ),
    ).toBe(false);
    expect(isBotUserAgent(undefined)).toBe(false);
    expect(isBotUserAgent('')).toBe(false);
  });
});

describe('翻譯資源與常數一致性', () => {
  // 預設語系以外的字串用到才載（loadLocale）
  beforeAll(async () => {
    await Promise.all(SUPPORTED_LOCALES.map(loadLocale));
  });
  it('LOCALE_LABELS 覆蓋所有支援語言', () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(LOCALE_LABELS[locale], locale).toBeTruthy();
    }
  });
  it('五語 bundle 的 key 集合一致（漏翻會在這裡現形）', () => {
    const keysOf = (locale: (typeof SUPPORTED_LOCALES)[number]) => {
      const bundle = createI18n(locale).getResourceBundle(locale, 'common') as Record<string, unknown>;
      const flat: string[] = [];
      const walk = (obj: Record<string, unknown>, prefix: string) => {
        for (const [k, v] of Object.entries(obj)) {
          const key = prefix ? `${prefix}.${k}` : k;
          if (v && typeof v === 'object') walk(v as Record<string, unknown>, key);
          else flat.push(key);
        }
      };
      walk(bundle, '');
      return flat.sort();
    };
    const reference = keysOf('zh-TW');
    expect(reference.length).toBeGreaterThan(0);
    for (const locale of SUPPORTED_LOCALES) {
      expect(keysOf(locale), `${locale} 的 key 集合應與 zh-TW 一致`).toEqual(reference);
    }
  });
});

describe('語系字串用到才載', () => {
  it('預設語系不用載；loadLocale 之後 createI18n 拿得到那個語系的字串', async () => {
    expect(isLocaleLoaded(defaultLocale())).toBe(true);
    await loadLocale('ko');
    expect(isLocaleLoaded('ko')).toBe(true);
    expect(createI18n('ko').t('nav.home')).not.toBe('nav.home');
  });
});

describe('createI18n instance 隔離（SSR 並發不互踩）', () => {
  it('兩個 instance 各自維持語言', async () => {
    const a = createI18n('en');
    const b = createI18n('ja');
    expect(a.language).toBe('en');
    expect(b.language).toBe('ja');
    await a.changeLanguage('ko');
    expect(a.language).toBe('ko');
    expect(b.language).toBe('ja');
  });
});
