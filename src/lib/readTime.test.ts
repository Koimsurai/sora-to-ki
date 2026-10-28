// @vitest-environment jsdom
import { describe, expect, it } from 'vite-plus/test';
import { readMinutes, readMinutesOfElements } from './readTime';

describe('readMinutes', () => {
  // 同一組範例也在後端 backend/src/util.rs 的 read_minutes_tests：兩邊要算出一樣的分鐘數
  const code = `\`\`\`ts\n${'let x = 1;\n'.repeat(60)}\`\`\`\n`;
  const mixed = `${'字'.repeat(400)}\n\n${'word '.repeat(230)}\n\n![a](/a.webp)\n![b](/b.webp)\n<img src="/c.webp" />\n\n\`\`\`\n${'x\n'.repeat(30)}\`\`\`\n`;
  const linky = `${'字'.repeat(780)}[看這裡](https://example.com/${'a/'.repeat(500)})\nhttps://example.com/${'b/'.repeat(500)}\n![圖](/a.webp#th=abc&w=1600&h=900)`;
  it.each([
    ['空白', '', 1],
    ['800 個中文字', '字'.repeat(800), 2],
    ['460 個英文詞', 'word '.repeat(460), 2],
    ['60 行程式碼', code, 2],
    ['只有 6 張圖', '![](/a.webp)\n'.repeat(6), 1],
    ['混合：1 + 1 + 0.5 + 1 = 3.5 → 4', mixed, 4],
    ['連結只算文字、網址與圖片網址不算', linky, 2],
  ])('%s', (_label, md, want) => {
    expect(readMinutes(md)).toBe(want);
  });

  it('HTML／JSX 標籤與 markdown 標題符號不算進字數', () => {
    const plain = '字'.repeat(1000);
    expect(readMinutes(`<div class="x">${plain}</div>`)).toBe(readMinutes(plain));
    expect(readMinutes(`## ${plain}`)).toBe(readMinutes(plain));
  });
});

describe('readMinutesOfElements（文章目錄的每一節）', () => {
  const html = (s: string) => {
    const div = document.createElement('div');
    div.innerHTML = s;
    return [...div.children];
  };

  it('一般段落照字數', () => {
    expect(readMinutesOfElements(html(`<p>${'字'.repeat(800)}</p>`))).toBe(2);
  });

  it('程式碼框照行數，裡面的字不再當文字算', () => {
    // 60 行 × 2 秒 = 2 分；如果程式碼的字也照字數算，會多出一大截
    expect(readMinutesOfElements(html(`<pre><code>${'const 中文變數 = 1;\n'.repeat(60)}</code></pre>`))).toBe(2);
  });

  it('包在別的元素裡的程式碼框也認得', () => {
    expect(readMinutesOfElements(html(`<div class="code"><pre>${'x\n'.repeat(60)}</pre></div>`))).toBe(2);
  });

  it('圖一張 10 秒', () => {
    expect(readMinutesOfElements(html(`<figure>${'<img src="/a.webp">'.repeat(12)}</figure>`))).toBe(2);
  });
});
