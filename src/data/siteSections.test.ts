import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vite-plus/test';

import { ABOUT_SECTIONS, MAIN_SECTIONS, MORE_SECTIONS, PAGES, TOGGLEABLE_KEYS } from './siteSections';

// 頁面登記表的不變式，以及它跟後端兩份清單的對應。
// 後端是 Rust、讀不到這個檔，所以兩邊各寫一份；不同步的話壞的方式都很安靜：
//   · TOGGLEABLE_PAGES 少一頁 → 後台按了「關掉」回 400，前端卻以為可以關
//   · og.rs 的 caps 跟這裡不同 → 分享圖上那行英文跟頁面上的對不起來
// 測試的工作目錄是 repo 根目錄。

const rust = (file: string) => readFileSync(`backend/src/handlers/${file}`, 'utf8');

describe('頁面登記表', () => {
  it('key 與路徑都不重複', () => {
    expect(new Set(PAGES.map((p) => p.key)).size).toBe(PAGES.length);
    expect(new Set(PAGES.map((p) => p.to)).size).toBe(PAGES.length);
  });

  it('分組照登記的順序：首頁、五個主要分區、關於選單、更多選單', () => {
    expect(PAGES[0]?.key).toBe('home');
    expect(MAIN_SECTIONS.map((p) => p.key)).toEqual(['notes', 'moments', 'works', 'collection', 'about']);
    expect(ABOUT_SECTIONS.map((p) => p.key)).toEqual(['setup', 'log', 'messages']);
    expect(MORE_SECTIONS.map((p) => p.key)).toEqual(['photos', 'friends', 'colophon']);
  });

  it('每一頁都認得自己的路徑', () => {
    for (const p of PAGES) expect(p.match(p.to.slice(1)), p.key).toBe(true);
  });

  it('能關的頁面跟後端 TOGGLEABLE_PAGES 一字不差', () => {
    const src = rust('site_config.rs');
    const list = /TOGGLEABLE_PAGES: \[&str; \d+\] = \[([^\]]*)\]/.exec(src)?.[1] ?? '';
    const backend = [...list.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    expect(backend).toEqual(TOGGLEABLE_KEYS);
  });

  it('分享圖（og.rs 的 PAGES）的 key 與 caps 跟這裡一樣', () => {
    const src = rust('og.rs');
    const og = new Map(
      [...src.matchAll(/Page \{ key: "([^"]+)", name: "[^"]*", caps: "([^"]*)"/g)].map((m) => [m[1], m[2]]),
    );
    for (const p of PAGES) {
      expect(og.has(p.key), `og.rs 少了 ${p.key}`).toBe(true);
      // 首頁的 caps 在 og.rs 是執行時算的（作者名的大寫），不比
      if (p.key !== 'home') expect(og.get(p.key), p.key).toBe(p.caps);
    }
  });
});
