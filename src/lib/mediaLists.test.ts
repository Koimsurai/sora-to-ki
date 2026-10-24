import { describe, expect, it } from 'vite-plus/test';
import { dedupeWatchItems } from './mediaLists';

// 封面牆少了一部不會有任何錯誤訊息，只有真的去數才知道：去掉的是不是該去的那些要靠這裡。

describe('dedupeWatchItems', () => {
  const item = (title: string, tmdbId: number | null, epCount: number | null) => ({ title, tmdbId, epCount });

  it('同一個 tmdbId 只留集數最多的那筆', () => {
    const { anime, tv } = dedupeWatchItems([item('進擊 動畫版', 1429, 25)], [item('進擊 影集版', 1429, 12)]);
    expect(anime.map((x) => x.title)).toEqual(['進擊 動畫版']);
    expect(tv).toEqual([]);
  });

  it('贏家在哪個清單就留在哪個清單', () => {
    const { anime, tv } = dedupeWatchItems([item('動畫少', 7, 3)], [item('影集多', 7, 30)]);
    expect(anime).toEqual([]);
    expect(tv.map((x) => x.title)).toEqual(['影集多']);
  });

  // 用標題比對會誤殺劇場版／同名不同季／不同語系譯名，
  // 而那種誤殺是「某部作品從清單上消失」，比留下重複難發現得多。
  it('沒有 tmdbId 的一律不去重，就算標題一模一樣', () => {
    const { anime, tv } = dedupeWatchItems([item('同名', null, 1)], [item('同名', null, 99)]);
    expect(anime).toHaveLength(1);
    expect(tv).toHaveLength(1);
  });

  it('集數相同時保留先出現的（anime 在前），結果是確定的', () => {
    const { anime, tv } = dedupeWatchItems([item('A', 5, 10)], [item('B', 5, 10)]);
    expect(anime.map((x) => x.title)).toEqual(['A']);
    expect(tv).toEqual([]);
  });

  it('epCount 是 null 的當成 0，不會贏過有集數的', () => {
    const { anime, tv } = dedupeWatchItems([item('沒集數', 9, null)], [item('有集數', 9, 1)]);
    expect(anime).toEqual([]);
    expect(tv.map((x) => x.title)).toEqual(['有集數']);
  });

  it('同一個清單內部的重複也會去掉', () => {
    const { anime } = dedupeWatchItems([item('少', 3, 2), item('多', 3, 20)], []);
    expect(anime.map((x) => x.title)).toEqual(['多']);
  });

  it('不同 tmdbId 一個都不會少', () => {
    const { anime, tv } = dedupeWatchItems([item('a', 1, 1), item('b', 2, 1)], [item('c', 3, 1)]);
    expect(anime).toHaveLength(2);
    expect(tv).toHaveLength(1);
  });

  it('空清單不會炸', () => {
    expect(dedupeWatchItems([], [])).toEqual({ anime: [], tv: [] });
  });
});
