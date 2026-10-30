import { describe, expect, it } from 'vite-plus/test';
import { siteProblems, type Draft } from './siteDraft';

const base: Draft = {
  default_locale: 'zh-TW',
  locales: ['zh-TW'],
  name: '宙と木',
  author: '',
  description: '',
  email: '',
  github: '',
  disabled_pages: [],
  page_descriptions: {},
};

describe('siteProblems', () => {
  it('站名空白或太長都擋', () => {
    expect(siteProblems({ ...base, name: '   ' })).toEqual([{ field: 'name', key: 'nameRequired' }]);
    expect(siteProblems({ ...base, name: '字'.repeat(61) })[0]).toMatchObject({ key: 'nameTooLong', max: 60 });
    expect(siteProblems(base)).toEqual([]);
  });

  it('信箱要有 @、GitHub 貼網址或帶 @ 也收', () => {
    expect(siteProblems({ ...base, email: 'nope' })).toEqual([{ field: 'email', key: 'email' }]);
    expect(siteProblems({ ...base, email: 'me@example.com' })).toEqual([]);
    expect(siteProblems({ ...base, github: 'https://github.com/Koimsurai/' })).toEqual([]);
    expect(siteProblems({ ...base, github: '@Koimsurai' })).toEqual([]);
    expect(siteProblems({ ...base, github: 'a/b' })).toEqual([{ field: 'github', key: 'github' }]);
  });
});
