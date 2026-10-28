// codeHighlight：直接用真的 @pierre/highlights 跑（wasm 內嵌在模組裡，node 也跑得動），不 mock。
// 守的是站上其他地方依賴的形狀：<pre class="shiki"> 與每行一個 <span class="line">（行號、DiffBlock、終端機框）。
import { describe, expect, it } from 'vite-plus/test';
import { highlightCode, resolveLang } from './codeHighlight';

/** 把輸出的 HTML 還原成原本的字：標籤拿掉、實體解回來 */
const textOf = (html: string) =>
  html
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

const supported = (lang: string) => ['typescript', 'ts', 'sql', 'xml', 'bash', 'text'].includes(lang);

describe('語言名稱', () => {
  it('沒指定語言 → text', () => {
    expect(resolveLang(undefined, supported)).toBe('text');
    expect(resolveLang('', supported)).toBe('text');
  });

  it('套件不認得的別名轉成它認得的（svg → xml、mysql → sql）', () => {
    expect(resolveLang('svg', supported)).toBe('xml');
    expect(resolveLang('MySQL', supported)).toBe('sql');
  });

  it('大小寫不影響', () => {
    expect(resolveLang('TS', supported)).toBe('ts');
  });

  it('認不得的退回 text，原型鏈上的名字也不算', () => {
    expect(resolveLang('console', supported)).toBe('text');
    expect(resolveLang('constructor', supported)).toBe('text');
    expect(resolveLang('toString', supported)).toBe('text');
  });
});

describe('輸出的形狀（站上的樣式依賴它）', () => {
  it('外層是 pre.shiki，帶主題的背景與前景色', async () => {
    const html = await highlightCode('const a = 1', 'ts');
    expect(html).toMatch(/^<pre class="shiki vitesse-dark" style="background-color:#[0-9a-f]+;color:#[0-9a-f]+"/);
    expect(html.endsWith('</code></pre>')).toBe(true);
  });

  it('每一行一個 span.line，行與行之間是換行（行號的 CSS counter 數這個）', async () => {
    const html = await highlightCode('a\nb\n\nc', 'bash');
    expect(html.match(/<span class="line">/g)).toHaveLength(4);
  });

  it('有上色：ts 的關鍵字跟變數不是同一個顏色', async () => {
    const html = await highlightCode('const value = 1', 'ts');
    const colors = new Set([...html.matchAll(/color:(#[0-9a-f]+)/g)].map((m) => m[1]));
    expect(colors.size).toBeGreaterThan(2);
  });
});

describe('內容原樣保留', () => {
  it('還原回來的字跟原本的一模一樣（含 HTML 特殊字元）', async () => {
    const code = 'if (a < b && c > d) {\n  return "<p>&nbsp;</p>";\n}';
    expect(textOf(await highlightCode(code, 'ts'))).toBe(code);
  });

  it('認不得的語言照樣輸出（純文字），不丟例外', async () => {
    const code = '$ npm run build\n> done';
    const html = await highlightCode(code, 'console');
    expect(textOf(html)).toBe(code);
    expect(html).toContain('<span class="line">');
  });

  it('沒有 <script> 之類的東西被當成標籤漏出去', async () => {
    const html = await highlightCode('<script>alert(1)</script>', 'text');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
