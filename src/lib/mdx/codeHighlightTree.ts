// 伺服器編譯文章時順便把程式碼上色（只在伺服器用，由 lib/mdx/mdx-compile.ts 動態 import）。
//
// 原本是瀏覽器先畫純文字、閒下來再載高亮器（@pierre/highlights，約 400 KB）上色。改成在這裡用同一個
// highlightCode 先上好，結果掛在節點上隨文章送過去：
//   · 程式碼區塊（```lang）→ <code> 的 data-highlighted 屬性，components/blog/BlogPost 的 CodeBlock 讀
//   · <Diff> → highlighted 屬性，components/mdx/DiffBlock 讀
// 元件拿到就直接用；沒有（後台預覽、上色失敗）才照舊在瀏覽器裡上色。
//
// 哪些要上色、程式碼字串怎麼取，都要跟元件的判斷一模一樣，否則元件拿到的會是別段碼的顏色。
import { literalValue, type HastNode } from '@koimsurai/mdx-core';
import { highlightCode } from './codeHighlight';
import { parseDiff } from './diffLines';
import { looksLikeMermaid } from './mermaidFences';

interface Attribute {
  type: string;
  name?: string;
  value?: unknown;
}

const textOf = (node: HastNode): string =>
  node.type === 'text'
    ? typeof node.value === 'string'
      ? node.value
      : ''
    : (node.children ?? []).map(textOf).join('');

/** 屬性值：字串直接拿；運算式（code={`…`}）照前端 evaluater 的規則取字面值，取不到就算了 */
function attrValue(attrs: Attribute[], name: string): string | undefined {
  const a = attrs.find((x) => x.type === 'mdxJsxAttribute' && x.name === name);
  if (!a) return undefined;
  if (typeof a.value === 'string') return a.value;
  const estree = (a.value as { data?: { estree?: { body?: { expression?: unknown }[] } } } | null)?.data?.estree;
  const expr = estree?.body?.[0]?.expression;
  if (!expr) return undefined;
  try {
    const v = literalValue(expr as Parameters<typeof literalValue>[0], name);
    return typeof v === 'string' ? v : undefined;
  } catch {
    return undefined;
  }
}

/** 樹裡所有要上色的地方，先收集再一起上色（highlightCode 是非同步的） */
function collect(node: HastNode, jobs: (() => Promise<void>)[]): void {
  if (node.type === 'element' && node.tagName === 'code') {
    const props = (node.properties ?? {}) as Record<string, unknown>;
    // 作者自己寫的同名屬性不算數：這個值會當 HTML 插進頁面，只能是這裡產生的
    delete props.dataHighlighted;
    node.properties = props;
    // 同 CodeBlock：className 裡的 language-xxx、文字以換行結尾才是區塊、mermaid 另外畫
    const className = Array.isArray(props.className)
      ? props.className.join(' ')
      : typeof props.className === 'string'
        ? props.className
        : '';
    const lang = /language-(\w+)/.exec(className)?.[1];
    const raw = textOf(node);
    const code = raw.replace(/\n$/, '');
    if (lang && raw.endsWith('\n') && lang !== 'mermaid' && !(lang === 'text' && looksLikeMermaid(code))) {
      jobs.push(async () => {
        props.dataHighlighted = await highlightCode(code, lang);
      });
    }
    return;
  }
  if (node.type === 'mdxJsxFlowElement' && node.name === 'Diff') {
    const attrs = ((node.attributes as Attribute[] | undefined) ?? []).filter(
      (a) => !(a.type === 'mdxJsxAttribute' && a.name === 'highlighted'),
    );
    node.attributes = attrs;
    const code = attrValue(attrs, 'code') ?? '';
    const lang = attrValue(attrs, 'lang') ?? 'text';
    jobs.push(async () => {
      attrs.push({
        type: 'mdxJsxAttribute',
        name: 'highlighted',
        value: await highlightCode(parseDiff(code).code, lang),
      });
    });
  }
  for (const child of node.children ?? []) collect(child, jobs);
}

/** 編譯好的 hast JSON → 程式碼上好色的 hast JSON。單段上色失敗就跳過那段（元件會在瀏覽器裡再試） */
export async function highlightTree(json: string): Promise<string> {
  const tree = JSON.parse(json) as HastNode;
  const jobs: (() => Promise<void>)[] = [];
  collect(tree, jobs);
  if (jobs.length === 0) return json;
  await Promise.all(jobs.map((job) => job().catch(() => undefined)));
  return JSON.stringify(tree);
}
