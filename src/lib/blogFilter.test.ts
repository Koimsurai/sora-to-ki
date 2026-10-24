import { describe, expect, it } from 'vite-plus/test';
import { filterPosts, groupPostsByYear } from './blogFilter';
import { parseServerDate } from './serverDate';

// Blog.tsx 的篩選與分組。壞掉的樣子是「這篇好像不見了」或「怎麼分到上個月」，
// 兩種都沒有錯誤訊息，e2e 也只驗得了「篩完會變少」。

const post = (o: Partial<Parameters<typeof filterPosts>[0][number]> & { title: string }) => ({
  content_preview: '',
  tags: [] as string[],
  category: null,
  created_at: '2026-08-04 09:00:00',
  ...o,
});

describe('filterPosts', () => {
  const POSTS = [
    post({ title: 'Rust 入門', content_preview: '談談所有權', tags: ['rust'], category: '技術' }),
    post({ title: '生活雜記', content_preview: '今天很熱', tags: ['日常'], category: '生活' }),
    post({ title: 'TypeScript 型別', content_preview: 'rust 也有類似的', tags: ['ts'], category: '技術' }),
  ];
  const NONE = { searchTerm: '', selectedTag: '', selectedCategory: '' };
  const titles = (r: { title: string }[]) => r.map((p) => p.title);

  it('三個條件都空就是全部', () => {
    expect(filterPosts(POSTS, NONE)).toHaveLength(3);
  });

  it('搜尋同時比對標題與內文摘要，不分大小寫', () => {
    expect(titles(filterPosts(POSTS, { ...NONE, searchTerm: 'RUST' }))).toEqual(['Rust 入門', 'TypeScript 型別']);
    expect(titles(filterPosts(POSTS, { ...NONE, searchTerm: '很熱' }))).toEqual(['生活雜記']);
  });

  it('標籤是精確比對，不是包含', () => {
    expect(titles(filterPosts(POSTS, { ...NONE, selectedTag: 'rust' }))).toEqual(['Rust 入門']);
    expect(filterPosts(POSTS, { ...NONE, selectedTag: 'rus' })).toEqual([]);
  });

  it('分類是精確比對', () => {
    expect(titles(filterPosts(POSTS, { ...NONE, selectedCategory: '技術' }))).toEqual(['Rust 入門', 'TypeScript 型別']);
  });

  // 三個條件是**交集**不是聯集——弄反的話畫面上是「篩了等於沒篩」
  it('三個條件取交集', () => {
    expect(titles(filterPosts(POSTS, { searchTerm: 'rust', selectedTag: 'ts', selectedCategory: '技術' }))).toEqual([
      'TypeScript 型別',
    ]);
    // 互斥時是空的，不是「其中一個」
    expect(filterPosts(POSTS, { searchTerm: 'rust', selectedTag: '日常', selectedCategory: '' })).toEqual([]);
  });

  it('分類是 null 的文章不會被分類篩選誤中', () => {
    const p = [post({ title: '沒分類' })];
    expect(filterPosts(p, { ...NONE, selectedCategory: '技術' })).toEqual([]);
    expect(filterPosts(p, NONE)).toHaveLength(1);
  });

  it('保持原本的先後順序', () => {
    expect(titles(filterPosts(POSTS, { ...NONE, selectedCategory: '技術' }))).toEqual(['Rust 入門', 'TypeScript 型別']);
  });

  it('空清單不會炸', () => {
    expect(filterPosts([], { searchTerm: 'x', selectedTag: 'y', selectedCategory: 'z' })).toEqual([]);
  });
});

describe('groupPostsByYear', () => {
  it('同一年的收在一組，新的年份在前', () => {
    const groups = groupPostsByYear([
      post({ title: 'a', created_at: '2025-06-10 12:00:00' }),
      post({ title: 'b', created_at: '2026-08-01 12:00:00' }),
      post({ title: 'c', created_at: '2025-02-20 12:00:00' }),
    ]);
    expect(groups.map((g) => g.year)).toEqual([2026, 2025]);
    expect(groups[1].posts.map((p) => p.title)).toEqual(['a', 'c']);
  });

  it('同一組內保持原本的先後順序', () => {
    const groups = groupPostsByYear([
      post({ title: '第一', created_at: '2026-08-20 12:00:00' }),
      post({ title: '第二', created_at: '2026-08-02 12:00:00' }),
    ]);
    expect(groups[0].posts.map((p) => p.title)).toEqual(['第一', '第二']);
  });

  // 後端的時間戳是 UTC 但沒有時區標記，直接 new Date() 會當成本地時間、整整早八小時
  // → 當地時間元旦凌晨 0~8 點發的文章會被分到**去年**
  it('時間戳當成 UTC 解析，元旦凌晨發的文章不會被分到去年', () => {
    // 2025-12-31 21:00 UTC = 台北時間 2026/1/1 清晨 5 點
    const groups = groupPostsByYear([post({ title: '新年', created_at: '2025-12-31 21:00:00' })]);
    expect(groups[0].year).toBe(parseServerDate('2025-12-31 21:00:00').getFullYear());
  });

  it('空清單回空陣列', () => {
    expect(groupPostsByYear([])).toEqual([]);
  });
});

describe('parseServerDate', () => {
  it('沒有時區標記的當成 UTC', () => {
    expect(parseServerDate('2026-08-04 09:37:31').toISOString()).toBe('2026-08-04T09:37:31.000Z');
  });

  it('帶 Z 或 T 的不動它', () => {
    expect(parseServerDate('2026-08-04T09:37:31Z').toISOString()).toBe('2026-08-04T09:37:31.000Z');
    expect(parseServerDate('2026-08-04T17:37:31+08:00').toISOString()).toBe('2026-08-04T09:37:31.000Z');
  });

  it('同一個瞬間，兩種寫法解析出來一樣', () => {
    expect(parseServerDate('2026-08-04 09:37:31').getTime()).toBe(parseServerDate('2026-08-04T09:37:31Z').getTime());
  });
});
