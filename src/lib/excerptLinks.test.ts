import { describe, expect, it } from 'vite-plus/test';
import { chapterOptions, excerptSegments, orphanLinks, setLink } from './excerptLinks';

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

describe('excerptSegments：摘要切成一句一句', () => {
  it('中文照句號、問號切，拼回去就是整段摘要', () => {
    const ex = '作者換了編輯器。為什麼？因為快！';
    const segs = excerptSegments(ex, []);
    expect(segs.map((s) => s.text)).toEqual(['作者換了編輯器。', '為什麼？', '因為快！']);
    expect(segs.map((s) => s.raw).join('')).toBe(ex);
  });

  it('英文的句點後面要接空白才算句尾（版本號、網址裡的點不切）', () => {
    const segs = excerptSegments('Upgraded to v1.2.3 today. It works.', []);
    expect(segs.map((s) => s.text)).toEqual(['Upgraded to v1.2.3 today.', 'It works.']);
  });

  it('沒有句尾標點的最後一段也要留著', () => {
    expect(excerptSegments('第一句。最後沒有句號', []).map((s) => s.text)).toEqual(['第一句。', '最後沒有句號']);
  });

  it('已經連過的半句原樣保留成一段，帶著它的章節', () => {
    const ex = '作者先比較了三台機器，最後選了最便宜的那台。';
    const segs = excerptSegments(ex, [{ text: '比較了三台機器', to: '02' }]);
    expect(segs.map((s) => [s.text, s.to])).toEqual([
      ['作者先', undefined],
      ['比較了三台機器', '02'],
      ['，最後選了最便宜的那台。', undefined],
    ]);
  });

  it('在摘要裡找不到的連結不會變成一段', () => {
    expect(excerptSegments('只有這句。', [{ text: '已經刪掉的句子', to: '01' }]).map((s) => s.text)).toEqual([
      '只有這句。',
    ]);
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
