// head 裡那段主題腳本（themeScript）：在 paint 之前決定 <html data-theme>。錯了的症狀是整頁先閃一次別的配色，
// 或站長的預設對沒選過的讀者沒有作用，兩者都不會有錯誤訊息。
import { describe, expect, it } from 'vite-plus/test';
import { currentTheme, defaultTheme, setDefaultTheme, themeScript, type Theme } from './theme';

/** 在假的 document／location／localStorage 上跑一次那段腳本，回傳掛上的 data-theme（沒掛是 null） */
function run(fallback: Theme, { search = '', stored = null as string | null, blocked = false } = {}) {
  const attrs = new Map<string, string>();
  const document = { documentElement: { setAttribute: (k: string, v: string) => attrs.set(k, v) } };
  const localStorage = {
    getItem: () => {
      if (blocked) throw new Error('SecurityError');
      return stored;
    },
  };
  // oxlint-disable-next-line typescript/no-implied-eval -- 測的就是那段要注入 head 的字串本身
  const script = new Function('document', 'location', 'localStorage', themeScript(fallback)) as (
    ...args: unknown[]
  ) => void;
  script(document, { search }, localStorage);
  return attrs.get('data-theme') ?? null;
}

describe('themeScript', () => {
  it('讀者沒選過：站長的預設；預設是土星就不掛', () => {
    expect(run('neptune')).toBe('neptune');
    expect(run('saturn')).toBeNull();
  });

  it('讀者選過的優先於站長的預設，選土星也算', () => {
    expect(run('neptune', { stored: 'blackhole' })).toBe('blackhole');
    expect(run('neptune', { stored: 'saturn' })).toBeNull();
  });

  it('網址的 ?theme= 最優先', () => {
    expect(run('neptune', { search: '?theme=betelgeuse', stored: 'blackhole' })).toBe('betelgeuse');
  });

  it('不在白名單的值當沒有，退回站長的預設', () => {
    expect(run('neptune', { search: '?theme=<script>', stored: 'mars' })).toBe('neptune');
  });

  it('localStorage 讀不到（被擋）也還是站長的預設', () => {
    expect(run('blackhole', { blocked: true })).toBe('blackhole');
  });
});

describe('站長的預設', () => {
  it('只收白名單裡的字；伺服器上 currentTheme 就是它', () => {
    setDefaultTheme('mars');
    expect(defaultTheme()).toBe('saturn');
    setDefaultTheme('neptune');
    expect(defaultTheme()).toBe('neptune');
    expect(currentTheme()).toBe('neptune');
    setDefaultTheme('saturn');
  });
});
