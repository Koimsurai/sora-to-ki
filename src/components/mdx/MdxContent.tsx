import { Fragment, startTransition, useEffect, useMemo, useState, type ReactElement } from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import { toJsxRuntime } from 'hast-util-to-jsx-runtime';
import { literalValue } from '@koimsurai/mdx-core';
import { MDX_BLOCKS } from './mdx-blocks-registry';
import './MdxContent.css';

interface MdxContentProps {
  /** server 端 `compileMdxSource` 產出的**序列化 hast 樹**（JSON 字串）。 */
  compiled: string;
  // 基礎元素 override（code/pre/p/a/img/h1-h4）由 BlogPost 傳入，與 markdown 管線共用同一批
  // 元件（程式碼高亮、mermaid、連結卡、圖片燈箱、標題錨點）→ MDX 文不比 markdown 文遜。
  baseComponents?: Record<string, unknown>;
  /**
   * 分批掛上去：先掛前 FIRST_NODES 個頂層節點，其餘每一幀補 STEP_NODES 個。之後的每一批走 startTransition，
   * React 渲染到一半可以讓出這一幀（程式碼上色、圖表這類重的區塊才不會整批擠在同一幀）。
   * 給「站內換頁進來」用（blog/BlogPost 決定）：整篇一次掛上的話，第一次排版要把一兩千個元素的字
   * 全部定形（實測 70ms 以上），剛好卡在轉場飛行的半途。那時候內文還沒露出來，分批不會被看見。
   * SSR、hydration、直接打開都是整篇一次（分批會讓 hydration 對不上，也會讓捲動還原找不到位置）。
   */
  progressive?: boolean;
  /** 全部掛完（progressive 時是最後一批掛上之後；否則是第一次掛上之後） */
  onDone?: () => void;
}

/**
 * 分批時第一批與之後每一批的頂層節點數（含段落之間的換行節點，所以實際的段落大約一半）。
 * 第一批小：它跟頁首、側欄擠在轉場半途的同一幀，而頁首底下那一屏下一幀就補齊了
 */
const FIRST_NODES = 8;
const STEP_NODES = 24;

/**
 * 渲染 server 編譯好的 MDX。
 *
 * ## 為什麼不是 `runSync`
 *
 * 以前是 server 產 `function-body` 字串、前端 `runSync` 執行成元件——而 `runSync`
 * 底層是 `new Function`，需要 CSP 的 `'unsafe-eval'`，等於把整站的 `script-src` 打開。
 *
 * 現在 server 產的是序列化的 hast 樹，這裡用 `hast-util-to-jsx-runtime` 走訪成 React
 * 元素。**沒有任何字串轉程式碼**。這支 util 就是 react-markdown 底層那個，所以
 * JSX 的空白規則、hast 屬性到 React props 的對應全都跟既有的 markdown 管線一致——
 * 自己重寫那套會在細節上跟 MDX 不同（實測過，表格與段落的換行會各差一種）。
 *
 * 仍然是**同步**的，所以 SSR 與 hydration 都能在 render 期直接跑，沒有 Suspense 破口。
 *
 * ## `createEvaluater` 是那條界線
 *
 * util 碰到 `items={[…]}` 這種屬性、以及大寫開頭的元件名時會呼叫 evaluater。
 * 官方的實作是 eval；這裡換成：
 *
 *   · 元件名 → **只從註冊表解析**（比 eval 嚴格，可解析的名字是封閉集合）
 *   · 屬性值 → 只接受字面值（`literalValue`，非字面值一律丟錯）
 *
 * 實際上這條路徑不太會丟錯，因為 server 端 `compileMdxSource` 已經先擋過一次；
 * 這裡是第二道，防的是「舊快取裡還留著用新規則編不出來的內容」。
 */
export function MdxContent({ compiled, baseComponents, progressive = false, onDone }: MdxContentProps) {
  const tree = useMemo(() => {
    try {
      return JSON.parse(compiled) as Parameters<typeof toJsxRuntime>[0];
    } catch (e) {
      return e instanceof Error ? e : new Error(String(e));
    }
  }, [compiled]);
  const total = tree instanceof Error || !('children' in tree) ? 0 : tree.children.length;
  const [limit, setLimit] = useState(progressive ? FIRST_NODES : Infinity);
  // 一幀補一批，補完通知外面（註腳的浮窗、目錄這些要等整篇都在才量得到）
  useEffect(() => {
    if (limit >= total) {
      onDone?.();
      return;
    }
    const id = requestAnimationFrame(() => startTransition(() => setLimit((l) => l + STEP_NODES)));
    return () => cancelAnimationFrame(id);
  }, [limit, total, onDone]);

  return useMemo(() => {
    // 自訂 block 覆蓋在 base 之上（同名以 block 為準）。
    const components = { ...baseComponents, ...MDX_BLOCKS } as Record<string, unknown>;
    try {
      if (tree instanceof Error) throw tree;
      // 只截頂層：節點的 key 照位置給，前面已經掛上的那些不會被重建
      const shown =
        limit >= total || !('children' in tree)
          ? tree
          : ({ ...tree, children: tree.children.slice(0, limit) } as typeof tree);
      // 明確標成 ReactElement：`toJsxRuntime` 宣告的回傳是 `JSX.Element`，
      // 而 type-aware lint 在這個 monorepo 的解析下把它判成 unresolved（no-unsafe-return）。
      const rendered: ReactElement = toJsxRuntime(shown, {
        Fragment,
        jsx: jsxRuntime.jsx,
        jsxs: jsxRuntime.jsxs,
        components: components as never,
        createEvaluater: () => ({
          // 參數型別來自 @types/estree（util 的介面），這裡只讀 type/name，
          // 其餘交給 mdx-core 的 literalValue 判斷，所以收窄成最小的結構型別。
          evaluateExpression: (node: unknown): unknown => {
            const n = node as { type?: string; name?: string };
            // ⚠ 大寫開頭的元件名**不走** components 查表：這支 util 會做成一個
            //   Identifier 節點交給 evaluater（官方版靠 eval 從模組作用域取值）。
            if (n.type === 'Identifier') {
              const c = components[n.name ?? ''];
              if (!c) throw new Error(`<${n.name}> 沒有註冊（見 mdx-blocks-registry）`);
              return c;
            }
            return literalValue(n as { type: string }, '屬性值');
          },
          evaluateProgram: (): never => {
            throw new Error('MDX 裡不支援 import / export');
          },
        }),
      }) as ReactElement;
      return rendered;
    } catch (e) {
      return (
        <div className="mdx-error">
          <strong>⚠ MDX 渲染失敗</strong>
          <pre>{e instanceof Error ? e.message : String(e)}</pre>
        </div>
      );
    }
  }, [tree, limit, total, baseComponents]);
}
