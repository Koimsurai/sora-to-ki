// Shiki 單例 highlighter — fine-grained core：只打包白名單語言的 grammar。
// 之前用完整 bundle（import 'shiki'），rollup 會把全部 ~200 個 grammar 各自切成 chunk
// （emacs-lisp 764K、wolfram 260K…），dist 被撐到 40MB+。改用 shiki/core +
// 顯式語言載入表後，只 emit 下面 LANG_LOADERS 列的語言。

import type { HighlighterCore, LanguageRegistration } from 'shiki/core';
import { lookup } from '@/lib/tableLookup';

interface LangModule {
  default: LanguageRegistration[];
}

/**
 * 兩個 highlighter，各用一種 regex 引擎：
 *
 * - `js`（預設）：shiki 的 JavaScript RegExp 引擎，不需要 wasm。以前一律用 oniguruma，
 *   每一篇有程式碼的文章都要下載 231 KB（gzip）的 wasm，再加一個 127ms 的長任務。
 * - `onig`：只給 {@link ONIG_LANGS} 用，有那些語言的文章才會載 wasm。
 *
 * 怎麼決定哪些語言留給 oniguruma：拿正式站**所有已發布文章的每一段程式碼**（2026-10：
 * 26 篇、214 段，含各語系譯文）兩種引擎各跑一次、逐段比對輸出的 HTML。213 段一字不差，
 * 唯一不同的是一段 C++（`static thread_local ruy::Context` 整行沒上色）——儘管 shiki 官方的
 * 相容性報告把 cpp 列為 OK（那是拿他們的範例碼測的）。C 家族共用同一批 pattern，一起留著。
 * 白名單加新語言時照同樣的方法比一次。
 */
type Engine = 'js' | 'onig';
const ONIG_LANGS = new Set(['cpp', 'c', 'objc']);
const highlighters: Partial<Record<Engine, Promise<HighlighterCore>>> = {};
const loadedLangs: Record<Engine, Set<string>> = { js: new Set(['text']), onig: new Set(['text']) };

const THEME = 'vitesse-dark';
const FALLBACK_LANG = 'text';

// 常見語言的 alias → Shiki 內建 id
const LANG_ALIAS: Record<string, string> = {
  js: 'javascript',
  ts: 'typescript',
  py: 'python',
  rb: 'ruby',
  rs: 'rust',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  yml: 'yaml',
  md: 'markdown',
  'c++': 'cpp',
  'objective-c': 'objc',
  dockerfile: 'docker',
  makefile: 'make',
  // 非合法 shiki id → 最接近的 grammar（舊版會直接 fallback 成純文字）
  svg: 'xml',
  mysql: 'sql',
  postgresql: 'sql',
  plsql: 'sql',
};

// 白名單語言 → 顯式動態 import（bundler 只會打包這些 grammar）
const LANG_LOADERS: Record<string, () => Promise<LangModule>> = {
  javascript: () => import('@shikijs/langs/javascript'),
  typescript: () => import('@shikijs/langs/typescript'),
  jsx: () => import('@shikijs/langs/jsx'),
  tsx: () => import('@shikijs/langs/tsx'),
  json: () => import('@shikijs/langs/json'),
  json5: () => import('@shikijs/langs/json5'),
  jsonc: () => import('@shikijs/langs/jsonc'),
  html: () => import('@shikijs/langs/html'),
  xml: () => import('@shikijs/langs/xml'),
  css: () => import('@shikijs/langs/css'),
  scss: () => import('@shikijs/langs/scss'),
  sass: () => import('@shikijs/langs/sass'),
  less: () => import('@shikijs/langs/less'),
  stylus: () => import('@shikijs/langs/stylus'),
  python: () => import('@shikijs/langs/python'),
  ruby: () => import('@shikijs/langs/ruby'),
  rust: () => import('@shikijs/langs/rust'),
  go: () => import('@shikijs/langs/go'),
  java: () => import('@shikijs/langs/java'),
  kotlin: () => import('@shikijs/langs/kotlin'),
  swift: () => import('@shikijs/langs/swift'),
  scala: () => import('@shikijs/langs/scala'),
  c: () => import('@shikijs/langs/c'),
  cpp: () => import('@shikijs/langs/cpp'),
  csharp: () => import('@shikijs/langs/csharp'),
  objc: () => import('@shikijs/langs/objc'),
  php: () => import('@shikijs/langs/php'),
  lua: () => import('@shikijs/langs/lua'),
  dart: () => import('@shikijs/langs/dart'),
  haskell: () => import('@shikijs/langs/haskell'),
  elixir: () => import('@shikijs/langs/elixir'),
  erlang: () => import('@shikijs/langs/erlang'),
  bash: () => import('@shikijs/langs/bash'),
  shellscript: () => import('@shikijs/langs/shellscript'),
  powershell: () => import('@shikijs/langs/powershell'),
  fish: () => import('@shikijs/langs/fish'),
  docker: () => import('@shikijs/langs/docker'),
  make: () => import('@shikijs/langs/make'),
  cmake: () => import('@shikijs/langs/cmake'),
  sql: () => import('@shikijs/langs/sql'),
  graphql: () => import('@shikijs/langs/graphql'),
  yaml: () => import('@shikijs/langs/yaml'),
  toml: () => import('@shikijs/langs/toml'),
  ini: () => import('@shikijs/langs/ini'),
  markdown: () => import('@shikijs/langs/markdown'),
  mdx: () => import('@shikijs/langs/mdx'),
  tex: () => import('@shikijs/langs/tex'),
  latex: () => import('@shikijs/langs/latex'),
  diff: () => import('@shikijs/langs/diff'),
  vue: () => import('@shikijs/langs/vue'),
  svelte: () => import('@shikijs/langs/svelte'),
  astro: () => import('@shikijs/langs/astro'),
  'angular-html': () => import('@shikijs/langs/angular-html'),
  regex: () => import('@shikijs/langs/regexp'),
  log: () => import('@shikijs/langs/log'),
};

function resolveLang(input: string | undefined): string {
  if (!input) return FALLBACK_LANG;
  const lower = String(input).toLowerCase();
  const resolved = LANG_ALIAS[lower] || lower;
  return lookup(LANG_LOADERS, resolved) ? resolved : FALLBACK_LANG;
}

async function createEngine(engine: Engine) {
  if (engine === 'js') {
    const { createJavaScriptRegexEngine } = await import('shiki/engine/javascript');
    return createJavaScriptRegexEngine();
  }
  const { createOnigurumaEngine } = await import('shiki/engine/oniguruma');
  return createOnigurumaEngine(import('shiki/wasm'));
}

function getHighlighter(engine: Engine): Promise<HighlighterCore> {
  const existing = highlighters[engine];
  if (existing) return existing;
  const created = (async () => {
    const [{ createHighlighterCore }, regexEngine] = await Promise.all([import('shiki/core'), createEngine(engine)]);
    const h = await createHighlighterCore({
      themes: [import('@shikijs/themes/vitesse-dark')],
      // ⚠ 不預載任何語言。原本這裡是 `[javascript, typescript, tsx]`（註解寫「預載常用」），
      // 而那三個 grammar 加起來 **520 KB**，每一篇文章頁無條件下載。
      //
      // 實測正式站的 18 篇含程式碼文章：真的用到 js/ts/tsx 的只有 8 篇，
      // **10 篇（56%）完全用不到卻照樣付那 520 KB**。而實際最常用的是
      // mermaid(15) / bash(9) / yaml(6) / console(6)，`ts` 只排第六——
      // 那份預載清單是憑印象挑的，跟真實內容對不上。
      //
      // 改成按需載入之後，用到 TS 的頁面會多一次 round trip（grammar 在 init 之後才抓，
      // 不再與 init 平行）。但那正是 bash / yaml / python 這些語言**今天已經在走**的路徑，
      // 也就是 56% 的頁面早就是這個行為，不是新的降級。
      langs: [],
      engine: regexEngine,
    });
    return h;
  })();
  highlighters[engine] = created;
  return created;
}

export async function highlightCode(code: string, langInput?: string): Promise<string> {
  const lang = resolveLang(langInput);
  const engine: Engine = ONIG_LANGS.has(lang) ? 'onig' : 'js';
  const h = await getHighlighter(engine);
  if (lang !== 'text' && !loadedLangs[engine].has(lang)) {
    try {
      await h.loadLanguage(await LANG_LOADERS[lang]());
      loadedLangs[engine].add(lang);
    } catch {
      // 載入失敗就 fallback
      return h.codeToHtml(code, { lang: 'text', theme: THEME });
    }
  }
  return h.codeToHtml(code, { lang: lang === 'text' ? 'text' : lang, theme: THEME });
}
