import { beforeAll, describe, expect, it } from 'vite-plus/test';

import { loadLocale } from '@/i18n/start-i18n';
import { setSiteIdentity } from '@/lib/siteIdentity';
import { builtinDescription, seoMetaFor } from './pageSeo';

// 各頁的描述：站長在站台設定寫了就用那段，沒寫就是字串檔的通用句子（帶上作者名，不是原作者的）
const description = (meta: ReturnType<typeof seoMetaFor>) =>
  meta?.find((m) => 'name' in m && m.name === 'description')?.content;

beforeAll(async () => {
  await Promise.all([loadLocale('zh-TW'), loadLocale('en')]);
  setSiteIdentity({
    url: 'https://example.com',
    name: '某某的站',
    author: '某某',
    description: '',
    disabled_pages: [],
    email: '',
    github: '',
    default_locale: 'zh-TW',
    locales: ['zh-TW', 'en'],
    theme: 'saturn',
    page_descriptions: { notes: { en: 'Notes on Rust and the web.' } },
    launch_pad: { lat: 23.7, lon: 121 },
  });
});

describe('各頁的描述', () => {
  it('站長寫過的那一格（那個語系）用站長的', () => {
    expect(description(seoMetaFor('blog', 'en', '/en/blog'))).toBe('Notes on Rust and the web.');
  });

  it('沒寫的語系、沒寫的頁用通用句子，名字是這個站的作者', () => {
    const zh = description(seoMetaFor('blog', 'zh-TW', '/blog'));
    expect(zh).toContain('某某');
    expect(zh).not.toContain('Koimsurai');
    expect(description(seoMetaFor('photos', 'en', '/en/photos'))).toBe('Photography by 某某.');
  });

  it('後台的提示字就是那句通用句子', () => {
    expect(builtinDescription('photos', 'en')).toBe('Photography by 某某.');
    expect(builtinDescription('aboutLead', 'zh-TW')).toBe('某某 的個人網站。');
  });
});
