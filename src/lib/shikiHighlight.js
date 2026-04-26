// Shiki 單例 highlighter — lazy 載入主題與語言，多次呼叫共用同個實例。
// 第一次呼叫某個語言／主題時才下載對應的 grammar / theme json。

let highlighterPromise = null;
const loadedLangs = new Set(['text']);

const THEME = 'vitesse-dark';
const FALLBACK_LANG = 'text';

// 常見語言的 alias → Shiki 內建 id
const LANG_ALIAS = {
  js: 'javascript',
  ts: 'typescript',
  jsx: 'jsx',
  tsx: 'tsx',
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
  vue: 'vue',
  svelte: 'svelte',
  dockerfile: 'docker',
  makefile: 'make',
};

// Shiki 認得的語言白名單（節錄常用的）— 不在此名單的會 fallback 到 text
const KNOWN_LANGS = new Set([
  'javascript', 'typescript', 'jsx', 'tsx', 'json', 'json5', 'jsonc',
  'html', 'xml', 'svg', 'css', 'scss', 'sass', 'less', 'stylus',
  'python', 'ruby', 'rust', 'go', 'java', 'kotlin', 'swift', 'scala',
  'c', 'cpp', 'csharp', 'objc', 'php', 'lua', 'dart', 'haskell', 'elixir', 'erlang',
  'bash', 'shell', 'powershell', 'fish', 'docker', 'make', 'cmake',
  'sql', 'graphql', 'plsql', 'mysql', 'postgresql',
  'yaml', 'toml', 'ini', 'markdown', 'mdx', 'tex', 'latex', 'diff',
  'vue', 'svelte', 'astro', 'angular-html',
  'regex', 'bnf', 'log',
]);

function resolveLang(input) {
  if (!input) return FALLBACK_LANG;
  const lower = String(input).toLowerCase();
  const resolved = LANG_ALIAS[lower] || lower;
  return KNOWN_LANGS.has(resolved) ? resolved : FALLBACK_LANG;
}

async function getHighlighter() {
  if (highlighterPromise) return highlighterPromise;
  highlighterPromise = (async () => {
    const { createHighlighter } = await import('shiki');
    const h = await createHighlighter({
      themes: [THEME],
      langs: ['javascript', 'typescript', 'tsx'], // 預載常用，其餘 lazy
    });
    return h;
  })();
  return highlighterPromise;
}

export async function highlightCode(code, langInput) {
  const lang = resolveLang(langInput);
  const h = await getHighlighter();
  if (lang !== 'text' && !loadedLangs.has(lang)) {
    try {
      await h.loadLanguage(lang);
      loadedLangs.add(lang);
    } catch {
      // 載入失敗就 fallback
      return h.codeToHtml(code, { lang: 'text', theme: THEME });
    }
  }
  return h.codeToHtml(code, { lang, theme: THEME });
}
