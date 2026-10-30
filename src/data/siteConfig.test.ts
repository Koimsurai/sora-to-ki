import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { enabledSections, isPageDisabled, sectionOfPath } from './siteConfig';
import { ABOUT_SECTIONS, MORE_SECTIONS } from './siteSections';

const config = (disabled: string[]) => ({
  url: '',
  name: '',
  author: '',
  description: '',
  disabled_pages: disabled,
  email: '',
  github: '',
  default_locale: 'zh-TW',
  locales: ['zh-TW', 'zh-CN', 'en', 'ja', 'ko'],
  page_descriptions: {},
});

describe('siteConfig', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('選單濾掉關掉的頁面，其餘順序不變', () => {
    expect(enabledSections(ABOUT_SECTIONS, config(['log'])).map((s) => s.key)).toEqual(['setup', 'messages']);
    expect(enabledSections(MORE_SECTIONS, config([])).map((s) => s.key)).toEqual(['photos', 'friends', 'colophon']);
  });

  it('無前綴路徑對得到分區；不屬於任何分區的路徑（文章、管理後台）是 undefined', () => {
    expect(sectionOfPath('about-site')?.key).toBe('colophon');
    expect(sectionOfPath('history')?.key).toBe('log');
    expect(sectionOfPath('blog/some-post')).toBeUndefined();
  });

  it('關掉的頁面要擋，沒關的放行', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(new Response(JSON.stringify(config(['setup'])))));
    const qc = new QueryClient();
    expect(await isPageDisabled(qc, 'setup')).toBe(true);
    expect(await isPageDisabled(qc, 'photos')).toBe(false);
  });

  it('後端連不上時當作全部開著（不能整站的頁面一起 404）', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new Error('ECONNREFUSED')));
    expect(await isPageDisabled(new QueryClient(), 'setup')).toBe(false);
  });
});
