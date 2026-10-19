import { describe, expect, it } from 'vite-plus/test';

import { groupOf, layoutConstellation, MIN_DIST_FOR_TEST, seriesOf, SKY_H, SKY_W } from './bookConstellation';

describe('seriesOf', () => {
  it.each([
    ['波西傑克森 5: 終極天神', '波西傑克森', 5],
    ['波西傑克森 1: 神火之賊', '波西傑克森', 1],
    ['馭光者1 黑稜鏡', '馭光者', 1],
    ['【套書】馭光者3 破碎眼（上中下）', '馭光者', 3],
    ['埃及守護神1：紅色金字塔', '埃及守護神', 1],
  ])('%s → %s #%i', (title, name, index) => {
    expect(seriesOf(title)).toEqual({ name, index });
  });

  it.each([
    // 書名中段的數字不是集數：這本會被誤認成「…全球每」第 19 集
    '世界盡頭的咖啡館：這一生，我為何而存在？（全球每19秒售出1本！）',
    '早什麼安啊：才剛打卡就想回家',
    '二手書店店員告白',
    '1984',
  ])('不是系列：%s', (title) => {
    expect(seriesOf(title)).toBeNull();
  });
});

describe('groupOf', () => {
  it.each([
    ['Juvenile Fiction', 'fantasy'],
    ['Fiction', 'literature'],
    ['American fiction', 'literature'],
    ['日本文學', 'literature'],
    ['Self-Help', 'life'],
    ['Humor', 'life'],
    ['Fortune-telling by books', 'life'],
    ['', 'other'],
    [null, 'other'],
    ['Cooking', 'other'],
  ] as const)('%s → %s', (c, g) => {
    expect(groupOf(c)).toBe(g);
  });
});

const BOOKS = [
  { id: 20, title: '波西傑克森 1: 神火之賊', categories: 'Juvenile Fiction' },
  { id: 21, title: '波西傑克森 2: 妖魔之海', categories: 'Juvenile Fiction' },
  { id: 22, title: '波西傑克森 3: 泰坦魔咒', categories: 'Juvenile Fiction' },
  { id: 25, title: '埃及守護神1：紅色金字塔', categories: 'Juvenile Fiction' },
  { id: 3, title: '馭光者1 黑稜鏡', categories: 'Fiction' },
  { id: 4, title: '馭光者2 盲眼刀', categories: 'Fiction' },
  { id: 7, title: '午夜圖書館', categories: 'Fiction' },
  { id: 8, title: '心', categories: '日本文學' },
  { id: 16, title: '停止內耗', categories: 'Self-Help' },
  { id: 13, title: '看得見謊言的我', categories: '' },
];

describe('layoutConstellation', () => {
  const sky = layoutConstellation(BOOKS);

  it('每本書都是一顆星，而且都在畫布裡', () => {
    expect(sky.stars).toHaveLength(BOOKS.length);
    for (const s of sky.stars) {
      expect(s.x).toBeGreaterThan(0);
      expect(s.x).toBeLessThan(SKY_W);
      expect(s.y).toBeGreaterThan(0);
      expect(s.y).toBeLessThan(SKY_H);
    }
  });

  it('同一份書單排出同一張天空（SSR 與 hydrate 要一致）', () => {
    const again = layoutConstellation([...BOOKS].reverse());
    const pos = (c: typeof sky) => Object.fromEntries(c.stars.map((s) => [s.book.id, [s.x, s.y]]));
    expect(pos(again)).toEqual(pos(sky));
  });

  it('系列按集數連線；只有一集的不連', () => {
    const percy = sky.lines.filter((l) => l.series === '波西傑克森').map((l) => l.ids);
    expect(percy).toEqual([
      [20, 21],
      [21, 22],
    ]);
    expect(sky.lines.filter((l) => l.series === '馭光者')).toHaveLength(1);
    expect(sky.lines.some((l) => l.series === '埃及守護神')).toBe(false);
    expect(sky.seriesLabels.map((l) => l.name).sort()).toEqual(['波西傑克森', '馭光者']);
  });

  it('系列整組在同一個星團（取第一集的分類）', () => {
    const groups = new Set(sky.stars.filter((s) => s.series?.name === '馭光者').map((s) => s.group));
    expect([...groups]).toEqual(['literature']);
  });

  it('星星不會壓在星團名稱上（名稱寫在錨點，星與書名要讓開）', () => {
    for (const c of sky.clusters) {
      for (const s of sky.stars) {
        const overlapX = Math.abs(s.x - c.x) < 55 + 20;
        const overlapY = s.y + 18 > c.y - 16 && s.y - 6 < c.y + 6;
        expect(overlapX && overlapY, `${s.book.title} 壓到 ${c.key}`).toBe(false);
      }
    }
  });

  it('任兩顆星不會疊在一起', () => {
    for (let i = 0; i < sky.stars.length; i++) {
      for (let j = i + 1; j < sky.stars.length; j++) {
        const a = sky.stars[i];
        const b = sky.stars[j];
        // 鬆弛有迭代上限，允許一點點誤差
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(MIN_DIST_FOR_TEST * 0.9);
      }
    }
  });
});
