import { describe, expect, it } from 'vite-plus/test';
import { chapterOptions, checkSelection, excerptPieces, orphanLinks, setLink } from './excerptLinks';

describe('chapterOptions：編號跟文章頁左邊印的一樣', () => {
  it('`##` 兩位數、底下的 `###` 接 .N，換大節時小節重新數', () => {
    const md = ['# 不算', '## 起點', '### 甲', '### 乙', '## 中段', '### 丙', '#### 太深不算'].join('\n');
    expect(chapterOptions(md).map((c) => `${c.num} ${c.text}`)).toEqual([
      '01 起點',
      '01.1 甲',
      '01.2 乙',
      '02 中段',
      '02.1 丙',
    ]);
  });

  it('還沒有任何 `##` 之前的 `###` 不編號（文章頁也不印）', () => {
    expect(chapterOptions('### 孤兒\n## 第一章').map((c) => c.num)).toEqual(['01']);
  });

  it('程式碼區塊裡的 `#` 不是標題', () => {
    expect(chapterOptions('## 真的\n```sh\n## 註解\n```\n## 也是真的').map((c) => c.text)).toEqual([
      '真的',
      '也是真的',
    ]);
  });
});

describe('excerptPieces：連過的幾段單獨一段，其餘原樣', () => {
  it('拼回去就是整段摘要，連過的那段帶著章節', () => {
    const ex = '作者先比較了三台機器，最後選了最便宜的那台。';
    const pieces = excerptPieces(ex, [{ text: '比較了三台機器', to: '02' }]);
    expect(pieces.map((p) => [p.text, p.to])).toEqual([
      ['作者先', undefined],
      ['比較了三台機器', '02'],
      ['，最後選了最便宜的那台。', undefined],
    ]);
    expect(pieces.map((p) => p.text).join('')).toBe(ex);
  });

  it('在摘要裡找不到的連結不會變成一段', () => {
    expect(excerptPieces('只有這句。', [{ text: '已經刪掉的句子', to: '01' }])).toEqual([
      { at: 0, text: '只有這句。' },
    ]);
  });

  it('重疊的只留先出現的（跟文章頁一樣）', () => {
    const pieces = excerptPieces('甲乙丙丁', [
      { text: '乙丙', to: '01' },
      { text: '丙丁', to: '02' },
    ]);
    expect(pieces.filter((p) => p.to).map((p) => p.text)).toEqual(['乙丙']);
  });
});

describe('checkSelection：反白的那段能不能連', () => {
  const ex = '作者先比較了三台機器，最後選了最便宜的那台。';
  const links = [{ text: '比較了三台機器', to: '02' }];

  it('摘要裡沒連過的一段可以', () => {
    expect(checkSelection(ex, links, '最便宜的那台')).toBeNull();
  });

  it('已經連過的同一段可以（那是換章節）', () => {
    expect(checkSelection(ex, links, '比較了三台機器')).toBeNull();
  });

  it('跟已經連的重疊不行，說得出跟哪一段', () => {
    expect(checkSelection(ex, links, '先比較')).toEqual({ key: 'overlap', params: { text: '比較了三台機器' } });
  });

  it('空的、太長的、摘要裡沒有的都說得出原因', () => {
    expect(checkSelection(ex, links, '')?.key).toBe('empty');
    expect(checkSelection('字'.repeat(200), [], '字'.repeat(121))).toEqual({
      key: 'tooLong',
      params: { max: 120, n: 121 },
    });
    expect(checkSelection(ex, links, '別篇的字')?.key).toBe('outside');
  });

  it('連滿 24 段之後不能再加新的，但還能換章節', () => {
    const many = Array.from({ length: 24 }, (_, i) => ({ text: `第${i}段`, to: '01' }));
    const text = many.map((l) => l.text).join('') + '新的一段';
    expect(checkSelection(text, many, '新的一段')).toEqual({ key: 'full', params: { max: 24 } });
    expect(checkSelection(text, many, '第3段')).toBeNull();
  });
});

describe('orphanLinks 與 setLink', () => {
  it('摘要改過之後找不到的連結列出來', () => {
    expect(
      orphanLinks('新的摘要。', [
        { text: '舊的句子', to: '01' },
        { text: '新的摘要', to: '02' },
      ]),
    ).toEqual([{ text: '舊的句子', to: '01' }]);
  });

  it('同一句再連一次是換章節，不是多一筆；null 是取消', () => {
    const one = setLink([], '甲。', '01');
    const moved = setLink(one, '甲。', '03');
    expect(moved).toEqual([{ text: '甲。', to: '03' }]);
    expect(setLink(moved, '甲。', null)).toEqual([]);
  });
});
