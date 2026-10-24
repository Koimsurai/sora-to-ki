import fc from 'fast-check';
import { describe, expect, it } from 'vite-plus/test';
import { dedupeWatchItems } from './mediaLists';

/**
 * 性質測試（fast-check）。
 *
 * 跟上面那份逐例測試的分工：那邊釘的是**我想得到的**具體情況（含變異測試指出來的邊界），
 * 這裡問的是「不管餵什麼進去，都該成立的事」——它會自己生上千組輸入去踩，
 * 找的是我沒想到要測的組合。失敗時 fast-check 會把反例縮到最小再印出來。
 *
 * ⚠ 只對純函式做。這幾支沒有 IO、沒有時序，同樣的輸入永遠同樣的輸出，
 *   才有辦法用「性質」描述。對元件做這件事只會得到一堆不穩定的測試。
 *
 * ⚠ 刻意不設 seed：每次跑不同的隨機輸入才有機會踩到新東西。
 *   真的踩到時 fast-check 會印出 seed 與 path，照它給的指令就能穩定重現。
 */

const watchArb = fc.record({
  title: fc.string({ maxLength: 10 }),
  tmdbId: fc.option(fc.integer({ min: 1, max: 8 }), { nil: null }),
  epCount: fc.option(fc.integer({ min: 0, max: 50 }), { nil: null }),
  isoDate: fc.option(fc.string({ maxLength: 10 }), { nil: null }),
});

describe('dedupeWatchItems 的性質', () => {
  it('沒有 tmdbId 的一個都不會被去掉', () => {
    fc.assert(
      fc.property(fc.array(watchArb, { maxLength: 20 }), fc.array(watchArb, { maxLength: 20 }), (a, t) => {
        const out = dedupeWatchItems(a, t);
        expect(out.anime.filter((x) => x.tmdbId == null)).toEqual(a.filter((x) => x.tmdbId == null));
        expect(out.tv.filter((x) => x.tmdbId == null)).toEqual(t.filter((x) => x.tmdbId == null));
      }),
    );
  });

  it('每個 tmdbId 去重後只會剩一筆，而且是集數最多的那個值', () => {
    fc.assert(
      fc.property(fc.array(watchArb, { maxLength: 20 }), fc.array(watchArb, { maxLength: 20 }), (a, t) => {
        const out = [...dedupeWatchItems(a, t).anime, ...dedupeWatchItems(a, t).tv];
        const withId = out.filter((x) => x.tmdbId != null);
        const ids = withId.map((x) => x.tmdbId);
        expect(new Set(ids).size, '同一個 tmdbId 出現超過一次').toBe(ids.length);

        const maxOf = (id: number | string) =>
          Math.max(...[...a, ...t].filter((x) => x.tmdbId === id).map((x) => x.epCount ?? 0));
        for (const x of withId) {
          if (x.tmdbId == null) continue; // 上面已經濾掉，這裡是給型別看的（oxlint 禁 `!`）
          expect(x.epCount ?? 0).toBe(maxOf(x.tmdbId));
        }
      }),
    );
  });

  it('去重不會憑空生出東西，也不會保留原本不存在的項目', () => {
    fc.assert(
      fc.property(fc.array(watchArb, { maxLength: 20 }), fc.array(watchArb, { maxLength: 20 }), (a, t) => {
        const out = dedupeWatchItems(a, t);
        expect(out.anime.length).toBeLessThanOrEqual(a.length);
        expect(out.tv.length).toBeLessThanOrEqual(t.length);
        for (const x of out.anime) expect(a).toContain(x);
        for (const x of out.tv) expect(t).toContain(x);
      }),
    );
  });
});
