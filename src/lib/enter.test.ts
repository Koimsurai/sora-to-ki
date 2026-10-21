import { describe, expect, it } from 'vite-plus/test';
import { enterStyle } from './enter';

describe('enterStyle', () => {
  it('把參數轉成 index.css 認得的 CSS 變數，帶單位', () => {
    expect(enterStyle({ delay: 90, x: -10, y: 0, dur: 300 })).toEqual({
      '--enter-delay': '90ms',
      '--enter-x': '-10px',
      '--enter-y': '0px',
      '--enter-dur': '300ms',
    });
  });

  it('沒給的就不寫，讓 CSS 的預設值生效', () => {
    expect(enterStyle()).toEqual({});
    // delay 0（列表第一項）不必寫出來，結果跟預設一樣
    expect(enterStyle({ delay: 0 })).toEqual({});
  });

  it('位移 0 是有意義的值（取消預設的 20px 上移），要寫出來', () => {
    expect(enterStyle({ y: 0 })).toEqual({ '--enter-y': '0px' });
  });
});
