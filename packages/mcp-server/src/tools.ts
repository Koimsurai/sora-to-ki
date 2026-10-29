// MCP 工具定義：每個工具 = 一段對 admin REST 端點的封裝。
// inputSchema 用原始 JSON Schema（不綁 zod，避免 SDK 內建 zod 與 repo zod 版本摩擦）。
import { readFile } from 'node:fs/promises';

import type { ApiClient } from './api.js';
import { BLOCKS, renderBlocksForGuide } from './blocks.js';
import {
  applyEdits,
  checkExcerptLinks,
  CONTENT_FIELDS,
  type Edit,
  effective,
  fetchPost,
  LIST_DEFAULT_FIELDS,
  LOCALES,
  outline,
  type Post,
  postForLocale,
  project,
  readFields,
  sourceOf,
  validateFields,
} from './posts.js';
import { validateContent } from './validate.js';

export interface Tool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties?: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
  handler: (args: Record<string, unknown>) => Promise<unknown>;
}

const EMPTY = { type: 'object' as const, properties: {}, additionalProperties: false };

/** 從 args 挑出有值的鍵組成 body（省略 undefined/null，''/false/0 保留）。 */
function pick(args: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    if (args[k] !== undefined && args[k] !== null) out[k] = args[k];
  }
  return out;
}

/**
 * 從 args 取出要插進網址的 id。
 *
 * 原本直接寫 `${idOf(a)}`：args 的型別是 unknown，漏傳 id 時會安靜地打到 `/api/admin/posts/undefined`，
 * 後端回的 404 讀起來像「文章不存在」而不是「呼叫少了參數」。
 */
function idOf(args: Record<string, unknown>): string {
  const { id } = args;
  if (typeof id === 'number' || (typeof id === 'string' && id !== '')) return encodeURIComponent(String(id));
  throw new Error('缺少 id（必須是數字或非空字串）');
}

// i18n 欄位（4 語 × 3 欄）。zh-TW 是來源（存在 title/content/excerpt），這裡是譯文欄。
const I18N_FIELDS = [
  'title_en',
  'content_en',
  'excerpt_en',
  'title_ja',
  'content_ja',
  'excerpt_ja',
  'title_ko',
  'content_ko',
  'excerpt_ko',
  'title_zh_cn',
  'content_zh_cn',
  'excerpt_zh_cn',
] as const;

const POST_WRITE_FIELDS = [
  'title',
  'content',
  'excerpt',
  'category',
  'status',
  'publish_at',
  'format',
  'layout_type',
  'tags',
  'series_name',
  'series_order',
  'allow_comments',
  'send_newsletter',
  'source_language',
  'slug',
  'excerpt_links',
  ...I18N_FIELDS,
] as const;

const postWriteProps = {
  title: { type: 'string', description: '標題' },
  content: { type: 'string', description: '內文（Markdown）' },
  excerpt: { type: 'string', description: '摘要；省略=NULL' },
  excerpt_links: {
    type: 'object',
    description:
      '摘要裡連到章節的句子，依語系分開：{"zh-TW": [{"text": "正確率只有 38%", "to": "05.4"}], "en": [...]}。' +
      'text 要逐字出現在該語系的摘要裡（找不到的不會顯示）；to 是章節編號：第幾個 ## 寫兩位數（05），' +
      '它底下第幾個 ### 再接 .N（05.4）。更新時只換有帶到的語系，帶 [] 刪掉那個語系、整個帶 null 全清。' +
      '簡體那組由 generate_post_zh_cn 從繁體自動轉出來，不必手填。',
    additionalProperties: {
      type: 'array',
      items: {
        type: 'object',
        properties: { text: { type: 'string' }, to: { type: 'string', pattern: '^\\d{2}(\\.\\d{1,2})?$' } },
        required: ['text', 'to'],
      },
    },
  },
  category: { type: 'string', description: '分類名（需已存在於 categories）' },
  status: {
    type: 'string',
    enum: ['draft', 'published', 'scheduled'],
    description: '狀態；建立時預設 draft。scheduled 要一起給 publish_at',
  },
  publish_at: {
    type: 'string',
    description:
      'status=scheduled 時的發佈時間，要在未來。帶時區的 ISO 8601（如 2026-10-28T09:00:00+08:00）；不帶時區的當成 UTC',
  },
  format: {
    type: 'string',
    enum: ['markdown', 'mdx'],
    description:
      "內容格式。用到自訂 block（<Note>/<Annot>/<Spoiler>/<BarChart>）或行內 JS {…} → 'mdx'；純文字/markdown → 'markdown'（預設）。用 mdx 前務必先讀 koimsurai_authoring_guide（有 <、{ 的跳脫規則）。",
  },
  slug: {
    type: 'string',
    description:
      "網址用的**英文** slug（例 'blog-post-rendering-strategy'）。省略時後端會自動從 title_en（沒有就 title）產生。" +
      '文章網址是 /blog/<slug>，所以請給精簡好讀的英文短語（3~8 個詞、全小寫、連字號分隔）。' +
      '⚠ 之後改 slug 沒關係——舊網址會自動 301 到新的，不會斷。',
  },
  layout_type: { type: 'string', description: "版面型別，預設 'record'" },
  tags: { type: 'array', items: { type: 'string' }, description: '標籤名陣列（不存在的會自動建立）' },
  series_name: { type: 'string', description: '系列名（可選）' },
  series_order: { type: 'number', description: '系列內排序（可選）' },
  allow_comments: { type: 'boolean', description: '是否開放留言，預設 true' },
  send_newsletter: {
    type: 'boolean',
    description: '⚠️ 若同時 status=published，會寄電子報給所有訂閱者——請先確認再設 true',
  },
  source_language: {
    type: 'string',
    enum: ['zh-TW', 'zh-CN', 'en', 'ja', 'ko'],
    description: "來源語言（title/content 用哪一語寫的），預設 'zh-TW'。其餘語言放 *_en/*_ja/*_ko/*_zh_cn 欄。",
  },
  ...i18nProps(),
  files: {
    type: 'object',
    description:
      '從 MCP server 本機的檔案讀欄位內容，免得長文整份塞進參數：{"content": "/path/post.mdx", "content_en": "/path/en.mdx"}。' +
      '只收文字欄位（title／content／excerpt 與各語系版本），同一欄不能同時用 files 又直接帶。',
    additionalProperties: { type: 'string' },
  },
  validate: {
    type: 'boolean',
    description:
      '預設 true：寫入前先在伺服器端驗每一個要寫進去的內文欄位（等同 validate_mdx），有錯就整筆拒絕、不寫入。' +
      '沒帶 format 時用文章現有的 format（建立時是 markdown）。不必再先另外呼叫 validate_mdx。',
  },
};

/** 可以用 files／edits 給的文字欄位 */
const TEXT_FIELDS: ReadonlySet<string> = new Set(['title', 'content', 'excerpt', ...I18N_FIELDS]);

/**
 * create_post / update_post 共用：組 body（直接帶的＋files 讀的＋edits 改的）→ 先驗 → 寫入 →
 * 讀回來只回摘要（id、slug、改了哪些欄、驗證結果、摘要連結有沒有對上），不回整篇內文。
 */
async function writePost(api: ApiClient, a: Record<string, unknown>, id?: string): Promise<Post> {
  const body = pick(a, [...POST_WRITE_FIELDS]);
  const merge = (extra: Post, from: string) => {
    for (const [k, v] of Object.entries(extra)) {
      if (k in body) throw new Error(`${k} 同時直接帶了又從 ${from} 給，只能擇一`);
      body[k] = v;
    }
  };
  if (a.files && typeof a.files === 'object') merge(await readFields(a.files as Post, TEXT_FIELDS), 'files');

  let before: Post | undefined;
  const edits = Array.isArray(a.edits) ? (a.edits as Edit[]) : [];
  if (edits.length) {
    if (!id) throw new Error('edits 只能用在 update_post');
    for (const e of edits) {
      if (e.field && !TEXT_FIELDS.has(e.field)) throw new Error(`edits 不能改 ${e.field}（只收文字欄位）`);
    }
    before = await fetchPost(api, id);
    merge(applyEdits(before, edits), 'edits');
  }

  const touchesContent = CONTENT_FIELDS.some((f) => typeof body[f] === 'string');
  let validation: Post | undefined;
  if (a.validate !== false && touchesContent) {
    let format = typeof body.format === 'string' ? body.format : undefined;
    if (!format && id) {
      before ??= await fetchPost(api, id);
      format = typeof before.format === 'string' ? before.format : undefined;
    }
    validation = await validateFields(body, format ?? 'markdown');
  }

  const res = id
    ? await api.request<{ data?: Post }>('PUT', `/api/admin/posts/${id}`, { body })
    : await api.request<{ data?: Post }>('POST', '/api/admin/posts', { body });
  const postId = id ?? String(res.data?.id);
  const after = await fetchPost(api, postId);

  const result: Post = {
    id: after.id,
    slug: after.slug,
    status: after.status,
    format: after.format,
    updated: Object.keys(body),
  };
  if (after.publish_at) result.publish_at = after.publish_at;
  // 只在有帶 tags 時回報：沒帶時後端的回應寫 `tags: []`，看起來像標籤被清掉了
  if ('tags' in body) result.tags = after.tags;
  if (validation) result.validation = validation;
  const touchesLinks = Object.keys(body).some((k) => /^(content|excerpt)/.test(k));
  if (touchesLinks && Object.keys(after.excerpt_links ?? {}).length) {
    result.excerpt_links = checkExcerptLinks(after);
  }
  if (res.data?.newsletter !== undefined) result.newsletter = res.data.newsletter;
  return result;
}

/** 4 語 × 3 欄的 i18n 屬性。zh-TW 是來源（存 title/content/excerpt）；這裡放各譯文語言。 */
function i18nProps(): Record<string, { type: 'string'; description: string }> {
  const langLabel: Record<string, string> = { en: '英文', ja: '日文', ko: '韓文', zh_cn: '簡體中文' };
  const fieldLabel: Record<string, string> = { title: '標題', content: '內文', excerpt: '摘要' };
  const out: Record<string, { type: 'string'; description: string }> = {};
  for (const lang of ['en', 'ja', 'ko', 'zh_cn'] as const) {
    for (const field of ['title', 'content', 'excerpt'] as const) {
      const zhcnNote = lang === 'zh_cn' ? '；簡體通常改用 generate_post_zh_cn 自動轉，不必手填' : '';
      out[`${field}_${lang}`] = {
        type: 'string',
        description: `${langLabel[lang]}${fieldLabel[field]}（譯文，可選）${zhcnNote}`,
      };
    }
  }
  return out;
}

// 完整撰寫指南——寫一篇文章前先讀。目標：Agent 一次產出結構完整、格式正確、可直接發布的文章。
const AUTHORING_GUIDE = `# koimsurai 文章撰寫指南（給 AI）

寫「一篇完整文章」前先讀這份。目標：一次到位——結構完整、格式正確、站長只要審不用大改。

## 1. 動手前
- 先 koimsurai_list_categories 看現有分類，用既有的（或明確跟站長確認要新分類）。
- 先 status='draft'。發布交給站長（審過再 set_post_status 或 send_newsletter）。
- 不確定該用哪個 block／忘記語法 → \`koimsurai_list_blocks\`（結構化目錄，比翻這份指南快）。
- **內文一定要驗過**：MDX 編譯失敗在前台是**靜默退回 markdown**（讀者會看到裸露的標籤原始碼）。create/update 預設會在寫入前驗（\`validate\`），有錯就拒絕；寫作途中想先看結果或章節大綱就跑 \`koimsurai_validate_mdx\`。千萬別帶 \`validate: false\` 繞過。
- **長文別整份來回送**：整篇用 \`files: {"content": "/path/post.mdx"}\` 從本機檔案讀；只改幾句用 update_post 的 \`edits\`。

## 2. 文章欄位（create_post 參數）
- **title**：想要副標就用全形冒號分隔「主標：副標」，前端自動把冒號後段渲染成副標。
  例：關掉翻譯器，程式卻關不掉：一個躺了兩年的 thread_local 死鎖
- **excerpt**：會渲染成文章開頭的「00 摘要」框 → 寫 2~4 句**真正的重點摘要**，不是複製第一段。
- **excerpt_links**：摘要裡幾句關鍵的話連到它所在的章節（讀者滑過時右邊目錄那一章會亮、點了跳過去）。
  一篇挑 4~9 句就好，每個語系各一組；格式見 create_post 的參數說明。章節編號照抄 validate_mdx（或 get_post 帶 outline）回的大綱，
  寫入後回傳的 excerpt_links 會列出哪幾條沒對上。
- **category**：必須是已存在的分類名。
- **tags**：3~5 個；不存在的會自動建立。
- **format**：用到下面「自訂 block / 圖表 / 行內 JS」→ 'mdx'；純文字 → 'markdown'（預設）。
- **status**：預設 draft。

## 3. 內文格式（純 markdown，兩種 format 都能用）
- 標題 \`##\` \`###\`（自動生 TOC 錨點，hover 出 #）
- 程式碼 \`\`\`語言 …\`\`\`（自動高亮 + emoji 語言標頭 + 行號 + 複製鈕；超過 15 行自動「展開程式碼」收合）
- Mermaid 圖 \`\`\`mermaid …\`\`\`
- **GitHub 彩色提示框**（善用，別通篇純引用 \`>\`）：
  \`> [!NOTE]\` 藍｜\`> [!TIP]\` 綠｜\`> [!IMPORTANT]\` 紫｜\`> [!WARNING]\` 琥珀｜\`> [!CAUTION]\` 紅
  ⚠ **不支援自訂標題**（標題固定顯示型別名）。\`[!NOTE]\` 要**單獨一行**，內容寫在下一行起——
  在同一行接字（\`> [!NOTE] 我還沒開 CSP\`）那串字會被併進內文，讀起來會怪。正確：
  \`> [!NOTE]\` 換行 \`> 其實我到現在還沒開 CSP——這個 eval 目前是可控的…\`
- 表格 / 清單 / 粗體 / 行內連結（行內連結自動有 hover 預覽卡）
- 圖片：先呼叫 \`koimsurai_upload_image\`（path / url / base64 三擇一）拿到 \`/uploads/…\` url，再用 \`![說明](url)\` 引用。別直接貼外部熱連結。

## 4. MDX 自訂 block（**只在 format='mdx'**）

完整結構化目錄（含 props / 何時用）可隨時呼叫 \`koimsurai_list_blocks\` 取得。

${renderBlocksForGuide()}

其他：行內算式（在文章裡求值，少用）\`今天 {new Date().getFullYear()} 年\`。
**圖表怎麼挑**：精確的技術圖（流程／時序／狀態／ER／架構）一律用 \`\`\`mermaid 圍籬——有工具列（切配色、縮放平移、全螢幕、下載 SVG/PNG）。只有「概念草圖／比喻」且節點少、或想要手繪風時才用 <Sketch>。

⚠️ mermaid 支援的圖表是 flowchart / sequenceDiagram / stateDiagram / classDiagram / erDiagram / xychart 六類。gantt、pie、mindmap、timeline、journey、gitGraph **不會渲染**。方向寫在語法裡（\`flowchart LR\`），沒有讀者端切換。
⚠️ 長的中文／日文標籤自己用 \`<br/>\` 斷在詞與詞之間（mermaid 圍籬與 <Sketch> 都一樣）：排版會在任意兩個字之間換行，不加的話可能從詞中間切開（「メインス｜レッド」）或最後一個字落單（「作らな｜い」）。
mermaid 可用 frontmatter 預設外觀，例如手繪風：\`\`\`mermaid 後接 \`---\` / \`config:\` / \`  look: handDrawn\` / \`  theme: dark\` / \`---\`。

## 5. ⚠️ MDX 的坑（format='mdx' 一定遵守，寫錯會編譯失敗）
在**一般段落文字**裡，\`<\` 和 \`{\` 會被當成 JSX/表達式 → 編譯失敗（會退回醜醜的純文字）。
- 要寫字面的角括號/大括號/泛型/JSON/指令 → **一律包反引號變 inline code**：
  ✅ \`Vec<String>\`、\`{ "key": 1 }\`、\`a < b\`、\`npm run <script>\`
  ❌ 正文直接寫 Vec<String> 或 { "key": 1 }
- 程式碼區塊 \`\`\` 裡的一切都安全，不用跳脫。
- 不需要自訂 block/行內 JS → 直接 format='markdown'，完全沒這個坑。

### ⚠️ CJK 的粗體／斜體會靜默失效（markdown 與 mdx 都會）
CommonMark 判斷 \`**\` 能不能當「起始」標記，看的是前後字元：**後面接標點時，前面必須是空白或標點**。
CJK 的 \`『』《》「」（）\` 全都算標點，所以夾在中日韓文字裡很容易踩到——**不會報錯，只會把星號原樣印出來**，
\`validate_mdx\` 也驗不出來（語法本身合法）。實測（用本專案的 @mdx-js/mdx）：

  ❌ \`の**『老人と海』**です\`            ← \`**\` 前是「の」後是「『」→ 不成立，星號外露
  ❌ \`**《老人と海》(노인과 바다)**가\`   ← 收尾 \`**\` 前是「)」後是韓文助詞 → 整個粗體失效
  ✅ \`**ヨルシカ**の『老人と海』です\`     ← 讓 \`**\` 貼著文字，標點留在外面
  ✅ \`… **《老人と海》(노인과 바다)**, 바로 …\`  ← 收尾 \`**\` 後面接標點

安全寫法：**粗體的頭尾都貼著「文字」而不是標點**，或讓緊鄰的外側是空白／標點。
日文的作品名用 \`『』\`、中文用 \`《》\` 本來就有強調效果，不必再加粗體——這是最省事的解法。
翻譯多語系時要**逐語系重看這一條**：同一句中文版正常、日文／韓文版可能就壞了（助詞位置不同）。

## 6. 多語系（i18n）——站台支援 5 語（zh-TW 來源／zh-CN／en／ja／ko）
- **來源**：title/content/excerpt 即來源語言（預設 zh-TW；非繁中寫的用 source_language 指定）。
- **簡體 zh-CN**：別手翻。建立/更新繁體後呼叫 \`koimsurai_generate_post_zh_cn\`（OpenCC 自動繁→簡）即可。
- **英/日/韓 en/ja/ko**：要出多語就翻好填進對應欄位（create_post / update_post 都能帶）——
  \`title_en\`/\`content_en\`/\`excerpt_en\`、\`title_ja\`/\`content_ja\`/\`excerpt_ja\`、\`title_ko\`/\`content_ko\`/\`excerpt_ko\`。
  - content_* 與來源共用同一 format（全篇一種）；自訂 block／程式碼區塊照用，第 5 點的 MDX 跳脫規則一樣要守。
  - 某語譯文留空 → 前端該語自動 fallback 回來源，不會壞頁。可先發繁體、之後再 update_post 補譯文。
- 只想單發繁體 → 這段整段略過。

## 7. 一次寫好的檢查清單
1) 分類存在　2) title 決定要不要副標（冒號）　3) excerpt 是真的重點摘要
4) 內文穿插彩色 alert / 程式碼 / 圖表，別通篇純引用　5) format='mdx' 的話正文 \`<\`/\`{\` 都跳脫了
6) tags 3~5　7) status='draft' 交站長審　8) 要多語？zh-CN 用 generate 工具、en/ja/ko 填譯文欄
9) **寫入時沒被驗證擋下**（多語系的每個 content_* 都會一起驗），回傳的 excerpt_links 每個語系都「全部對上」`;

// mime ↔ 副檔名（後端用「原始檔名的副檔名」決定存檔 ext、用 mimetype 判斷：image/ 算 thumbhash，
// video/ 把旋轉 metadata 烘進畫素）。影片的 mimetype 一定要對，不然手機直拍的片會躺著播。
const EXT_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  avif: 'image/avif',
  bmp: 'image/bmp',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
};
const MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/avif': 'avif',
  'image/bmp': 'bmp',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
};
function extOf(name: string): string {
  return /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase() ?? '';
}

/** 從 path / url / data(base64) 三擇一解析出圖片 bytes + 檔名 + mimetype。 */
async function resolveImage(a: {
  path?: string;
  url?: string;
  data?: string;
  filename?: string;
}): Promise<{ bytes: Uint8Array; filename: string; mime: string }> {
  let bytes: Uint8Array;
  let name = a.filename;
  let mime: string | undefined;

  if (a.path) {
    const { readFile } = await import('node:fs/promises');
    const { basename } = await import('node:path');
    bytes = new Uint8Array(await readFile(a.path));
    name ??= basename(a.path);
  } else if (a.url) {
    const res = await fetch(a.url);
    if (!res.ok) throw new Error(`下載圖片失敗 (${res.status})：${a.url}`);
    bytes = new Uint8Array(await res.arrayBuffer());
    // `?? ''` 再 `||`：空字串（沒有 content-type、網址以 / 結尾）也當成沒有。
    mime = (res.headers.get('content-type')?.split(';')[0]?.trim() ?? '') || undefined;
    name ??= (new URL(a.url).pathname.split('/').pop() ?? '') || 'image';
  } else if (a.data) {
    const m = /^data:([^;]+);base64,(.*)$/s.exec(a.data.trim());
    mime = m ? m[1] : mime;
    bytes = new Uint8Array(Buffer.from(m ? m[2] : a.data.trim(), 'base64'));
    name ??= 'image';
  } else {
    throw new Error('請提供 path、url 或 data（base64）其中之一');
  }

  // 確保檔名有副檔名（後端靠它決定存檔 ext）；沒有就用 mimetype 推。
  if (!extOf(name)) {
    const ext = (mime ? MIME_EXT[mime.toLowerCase()] : undefined) ?? 'png';
    name = `${name}.${ext}`;
  }
  // mimetype 沒拿到就用副檔名推（後端只看 starts_with('image/') 決定 thumbhash）。
  mime ??= EXT_MIME[extOf(name)] || 'application/octet-stream';
  return { bytes, filename: name, mime };
}

export function makeTools(api: ApiClient): Tool[] {
  return [
    // ── 撰寫指南 ────────────────────────────────────────────────
    {
      name: 'koimsurai_authoring_guide',
      description:
        '取得 koimsurai 文章撰寫指南（欄位慣例、可用 block、彩色 alert、MDX 語法坑、檢查清單）。' +
        '寫「一篇完整文章」前先呼叫這個，尤其要用 format=mdx / 圖表 / 自訂 block 時。',
      inputSchema: EMPTY,
      handler: () => Promise.resolve(AUTHORING_GUIDE),
    },

    // ── 圖片上傳 ────────────────────────────────────────────────
    {
      name: 'koimsurai_upload_image',
      description:
        '上傳圖片或影片（mp4／webm／mov，上限 50MB）到後台（storage/uploads），回傳可直接放進文章的相對 URL 與引用語法。' +
        '來源三擇一：path（MCP server 本機檔案路徑，影片建議用這個）/ url（遠端檔案，下載後轉存）/ data（base64，可含 data: 前綴）。' +
        '圖片的 url 形如 /uploads/YYYY/MM/xxx.png#th=…&w=…&h=…（片段是模糊佔位與尺寸，原樣保留），文章裡用 ![alt](url)；' +
        '影片回的 markdown 是 <Video src="…" />（format 要是 mdx）。',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '本機圖片檔案路徑（三擇一）' },
          url: { type: 'string', description: '遠端圖片 URL，會下載後上傳（三擇一）' },
          data: { type: 'string', description: '圖片 base64，可含 data:image/…;base64, 前綴（三擇一）' },
          filename: {
            type: 'string',
            description: '檔名（決定副檔名）。path/url 可省略自動推斷；data 建議提供以帶正確副檔名',
          },
          alt: { type: 'string', description: '圖片替代文字（回傳的 ![alt](url)）；影片則當成 <Video> 的 caption' },
        },
        additionalProperties: false,
      },
      handler: async (a) => {
        const { bytes, filename, mime } = await resolveImage(a);
        const result = await api.uploadFile<{
          url: string;
          filename: string;
          thumbhash?: string | null;
        }>('/api/admin/upload', bytes, filename, mime);
        const alt = typeof a.alt === 'string' ? a.alt : '';
        const isVideo = mime.startsWith('video/');
        return {
          url: result.url,
          filename: result.filename,
          thumbhash: result.thumbhash ?? null,
          markdown: isVideo
            ? `<Video src="${result.url}"${alt ? ` caption="${alt.replaceAll('"', '”')}"` : ''} />`
            : `![${alt}](${result.url})`,
        };
      },
    },

    // ── 文章 CRUD ──────────────────────────────────────────────
    {
      name: 'koimsurai_list_posts',
      description:
        '列出後台文章（含草稿）。可依狀態/關鍵字過濾、分頁。' +
        `預設每篇只回 ${LIST_DEFAULT_FIELDS.join('、')}（不含內文）；要別的欄位用 fields 指定，["*"] 是全部。`,
      inputSchema: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['published', 'draft', 'scheduled', 'trashed'],
            description: '省略=全部（不含回收桶）',
          },
          search: { type: 'string', description: '標題/內文關鍵字' },
          page: { type: 'number', description: '頁碼，預設 1' },
          limit: { type: 'number', description: '每頁筆數，預設 10' },
          fields: {
            type: 'array',
            items: { type: 'string' },
            description:
              '每篇要回哪些欄位（例 ["id","title","excerpt","excerpt_links"]）；["*"] 回整列（含五個語系的全文，很大）',
          },
        },
        additionalProperties: false,
      },
      handler: async (a) => {
        const res = await api.request<{ posts: Post[]; total: number; totalPages: number; currentPage: number }>(
          'GET',
          '/api/admin/posts',
          { query: { status: a.status, search: a.search, page: a.page, limit: a.limit } },
        );
        const fields = Array.isArray(a.fields) ? (a.fields as string[]) : [...LIST_DEFAULT_FIELDS];
        const posts = fields.includes('*') ? res.posts : res.posts.map((p) => project(p, fields));
        return { total: res.total, totalPages: res.totalPages, currentPage: res.currentPage, posts };
      },
    },
    {
      name: 'koimsurai_get_post',
      description:
        '讀單篇文章。不帶參數回整列（五個語系的全部欄位，長文會很大）；' +
        '帶 locale 只回那個語系的 title／excerpt／content／excerpt_links 加上共用的中繼資料；' +
        '帶 fields 只回指定欄位（例 ["excerpt_links","status"]）。outline: true 另外附上該語系的章節編號大綱。',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'number', description: '文章 id' },
          locale: { type: 'string', enum: [...LOCALES], description: '只看這個語系' },
          fields: { type: 'array', items: { type: 'string' }, description: '只回這些欄位（跟 locale 擇一）' },
          outline: {
            type: 'boolean',
            description: '附上章節大綱（num 對標題，excerpt_links 的 to 就是 num）；語系看 locale，沒帶用來源語言',
          },
        },
        required: ['id'],
        additionalProperties: false,
      },
      handler: async (a) => {
        const post = await fetchPost(api, idOf(a));
        const locale = typeof a.locale === 'string' ? a.locale : undefined;
        let out: Post;
        if (locale) out = postForLocale(post, locale);
        else if (Array.isArray(a.fields)) out = project(post, a.fields as string[]);
        else out = post;
        if (a.outline === true) {
          out = { ...out, outline: outline(effective(post, 'content', locale ?? sourceOf(post))) };
        }
        return out;
      },
    },
    {
      name: 'koimsurai_list_blocks',
      description:
        '列出所有可用的 MDX 自訂 block（結構化目錄：名稱／何時用／props／範例／坑）。' +
        '寫 format=mdx 的文章、不確定該用哪個 block 或忘記語法時查這個，比翻整份指南快。',
      inputSchema: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            enum: ['prose', 'code', 'data', 'media', 'layout', 'interactive'],
            description:
              '只列某一類（省略=全部）。prose 文字表達｜code 程式碼｜data 數據視覺化｜media 圖與影片｜layout 結構編排｜interactive 讀者互動',
          },
        },
        additionalProperties: false,
      },
      handler: (a) => {
        const cat = typeof a.category === 'string' ? a.category : undefined;
        const list = cat ? BLOCKS.filter((b) => b.category === cat) : BLOCKS;
        return Promise.resolve({ count: list.length, blocks: list });
      },
    },
    {
      name: 'koimsurai_validate_mdx',
      description:
        '⭐ 驗證文章內容（**建議 create_post / update_post 前一定先跑**）。' +
        '會真的跑一次 MDX 編譯 + 檢查未知 block、alert 語法、手打編號、裸網址清單、外部熱連結。' +
        '重要：MDX 編譯失敗在前台是**靜默退回 markdown**（讀者看到裸露的標籤原始碼），而 create/update 仍回 success ' +
        '——不先驗就不會有人知道寫壞了。回 { ok, summary, errors, warnings, hints, outline }，errors 非空就別送出。' +
        'outline 是章節編號對標題（excerpt_links 的 to 就是這裡的 num）。' +
        '只是要寫入的話不必先跑這個：create_post／update_post 預設會在伺服器端先驗。',
      inputSchema: {
        type: 'object',
        properties: {
          content: { type: 'string', description: '要驗的文章內文（也可拿來驗某個語系的譯文）；跟 path 擇一' },
          path: { type: 'string', description: 'MCP server 本機的檔案路徑，讀進來當 content 驗' },
          format: { type: 'string', enum: ['markdown', 'mdx'], description: "內容格式，預設 'mdx'" },
        },
        additionalProperties: false,
      },
      handler: async (a) => {
        const content =
          typeof a.path === 'string' ? await readFile(a.path, 'utf8') : typeof a.content === 'string' ? a.content : '';
        if (!content) throw new Error('請提供 content 或 path');
        const result = await validateContent(content, typeof a.format === 'string' ? a.format : 'mdx');
        return { ...result, outline: outline(content) };
      },
    },
    {
      name: 'koimsurai_create_post',
      description:
        '建立文章。title/content 必填，其餘可選。預設 status=draft（不會直接公開）。' +
        '⭐ 寫「完整文章」前先呼叫 koimsurai_authoring_guide（副標/摘要/彩色 alert/自訂 block/MDX 坑/檢查清單）。' +
        '寫入前預設會在伺服器端驗過每個內文欄位（validate），有錯就拒絕；長文可用 files 從本機檔案讀。' +
        '回傳只有 id、slug、改了哪些欄、驗證結果與摘要連結檢查，不回內文。' +
        'title 用「主標：副標」冒號分隔會自動出副標；excerpt 會變成開頭的「00 摘要」框，excerpt_links 讓其中幾句連到章節。' +
        "用到 <Note>/<Annot>/<Spoiler>/<BarChart> 或行內 JS → format='mdx'。" +
        '多語系：zh-CN 用 generate_post_zh_cn 自動轉；en/ja/ko 填 title_en/content_en…等譯文欄（見指南第 6 點）。' +
        '注意 send_newsletter=true 且 published 會寄電子報。',
      inputSchema: {
        type: 'object',
        properties: postWriteProps,
        required: ['title', 'content'],
        additionalProperties: false,
      },
      handler: (a) => writePost(api, a),
    },
    {
      name: 'koimsurai_update_post',
      description:
        '更新文章。只送想改的欄位（其餘不動）。id 必填。' +
        '改一小段用 edits（[{old, new}]，預設改 content，也可指定 field 如 content_en），不必重送整篇；' +
        '整篇換掉的長文可用 files 從本機檔案讀。寫入前預設會驗過內文（validate），有錯就拒絕、不寫入。' +
        '回傳只有 id、slug、改了哪些欄、驗證結果；動到內文或摘要時另外回報 excerpt_links 有沒有對上。',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'number', description: '文章 id' },
          ...postWriteProps,
          edits: {
            type: 'array',
            description:
              '局部修改，照順序套用到現有內容上。每個 old 必須在當下的文字裡剛好出現一次（不唯一就多帶點前後文），' +
              '否則整筆拒絕。同一欄不能同時用 edits 又直接帶整份。',
            items: {
              type: 'object',
              properties: {
                field: { type: 'string', description: "要改的欄位，預設 'content'（也可 content_en、excerpt_ja…）" },
                old: { type: 'string' },
                new: { type: 'string' },
              },
              required: ['old', 'new'],
              additionalProperties: false,
            },
          },
        },
        required: ['id'],
        additionalProperties: false,
      },
      handler: (a) => writePost(api, a, idOf(a)),
    },
    {
      name: 'koimsurai_set_post_status',
      description: '只改文章狀態（draft ⇄ published），不動內容。發布請優先用這個。',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'number' },
          status: { type: 'string', enum: ['draft', 'published'] },
        },
        required: ['id', 'status'],
        additionalProperties: false,
      },
      handler: (a) => api.request('PATCH', `/api/posts/${idOf(a)}/status`, { body: { status: a.status } }),
    },
    {
      name: 'koimsurai_delete_post',
      description:
        '把文章丟進回收桶（讀者看不到，30 天後自動刪掉，期間可用 koimsurai_restore_post 還原）。' +
        '⚠️ permanent=true 才永久刪除（連同 post_tags，不可復原），而且只對已經在回收桶裡的文章有效——請先確認。',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'number' },
          permanent: { type: 'boolean', description: 'true：從回收桶永久刪除' },
        },
        required: ['id'],
        additionalProperties: false,
      },
      handler: (a) =>
        api.request('DELETE', `/api/admin/posts/${idOf(a)}`, {
          query: { permanent: a.permanent === true ? 'true' : undefined },
        }),
    },
    {
      name: 'koimsurai_restore_post',
      description: '從回收桶還原文章，回到丟之前的狀態（原本是排程的會回到草稿）。',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'number' } },
        required: ['id'],
        additionalProperties: false,
      },
      handler: (a) => api.request('POST', `/api/admin/posts/${idOf(a)}/restore`),
    },
    {
      name: 'koimsurai_generate_post_zh_cn',
      description: '由繁體來源自動生成該篇的簡體（zh-CN）欄位（opencc Tw2s）。id 必填。',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'number' } },
        required: ['id'],
        additionalProperties: false,
      },
      handler: (a) => api.request('POST', `/api/admin/posts/${idOf(a)}/generate-zh-cn`),
    },

    // ── 統計與健康 ─────────────────────────────────────────────
    {
      name: 'koimsurai_site_stats',
      description: '後台總覽：文章數/已發布/草稿/本月新文/留言數/本週留言/瀏覽數。',
      inputSchema: EMPTY,
      handler: () => api.request('GET', '/api/admin/stats'),
    },
    {
      name: 'koimsurai_vitals_stats',
      description: '前端 Core Web Vitals 聚合（LCP/CLS/INP/FCP/TTFB 的 count/p75/rating 分佈）。',
      inputSchema: {
        type: 'object',
        properties: { days: { type: 'number', description: '回看天數，預設 7' } },
        additionalProperties: false,
      },
      handler: (a) => api.request('GET', '/api/vitals/stats', { query: { days: a.days }, auth: false }),
    },
    {
      name: 'koimsurai_health',
      description: '後端健康檢查（回 OK）。用來確認服務在跑。',
      inputSchema: EMPTY,
      handler: () => api.request('GET', '/api/health', { auth: false }),
    },

    // ── 站台設定 ───────────────────────────────────────────────
    // 跟後台「站點設定」改的是同一份（資料庫）。金鑰不在這裡，在伺服器的環境變數。
    {
      name: 'koimsurai_get_site_config',
      description:
        '讀站台設定：網址（唯讀，部署時的 SITE_URL）、站名、作者、一句話介紹、關掉的頁面（disabled_pages）。改之前先讀一次看現況。',
      inputSchema: EMPTY,
      handler: () => api.request('GET', '/api/site/config', { auth: false }),
    },
    {
      name: 'koimsurai_update_site_config',
      description:
        '改站台設定，只改有帶的欄位，回傳改完的整份。改完前台的快取會立刻清掉。' +
        '\ndisabled_pages 是整份換掉不是增減：要多關一頁，先 koimsurai_get_site_config 拿現在的清單再加上去。' +
        '\n能關的頁面：moments（碎念）、works（作品）、collection（收藏）、setup（設備）、log（航行日誌）、' +
        'messages（留言）、photos（照片）、friends（朋友）、colophon（此站點）。' +
        '關掉碎念／作品／收藏時首頁土星會少一條軌道。手記與關於不能關。',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '站名（RSS 標題、信件、分享圖上的字），最多 60 字' },
          author: { type: 'string', description: '作者名；給空字串＝跟站名一樣' },
          description: { type: 'string', description: '一句話介紹（RSS 的描述），最多 300 字' },
          disabled_pages: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['moments', 'works', 'collection', 'setup', 'log', 'messages', 'photos', 'friends', 'colophon'],
            },
            description: '要關掉的頁面（整份換掉）。給空陣列＝全部打開',
          },
        },
        additionalProperties: false,
      },
      handler: (a) =>
        api.request('PUT', '/api/admin/site/config', {
          body: pick(a, ['name', 'author', 'description', 'disabled_pages']),
        }),
    },

    // ── 分類 ──────────────────────────────────────────────────
    {
      name: 'koimsurai_list_categories',
      description: '列出所有分類（含各分類文章數 post_count）。',
      inputSchema: EMPTY,
      handler: () => api.request('GET', '/api/admin/categories'),
    },
    {
      name: 'koimsurai_create_category',
      description: '建立分類。name 必填；slug 省略時由 name 生成。',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '分類名（同時是資料鍵：文章的 category 存的就是它）' },
          description: { type: 'string' },
          slug: { type: 'string' },
          short_description: { type: 'string' },
          name_en: { type: 'string', description: '英文顯示名（可選；不影響資料鍵）' },
          name_ja: { type: 'string', description: '日文顯示名（可選）' },
          name_ko: { type: 'string', description: '韓文顯示名（可選）' },
          name_zh_cn: { type: 'string', description: '簡中顯示名（可選）' },
          short_description_en: { type: 'string', description: '英文簡述（可選；分類 tooltip 用）' },
          short_description_ja: { type: 'string', description: '日文簡述（可選；分類 tooltip 用）' },
          short_description_ko: { type: 'string', description: '韓文簡述（可選；分類 tooltip 用）' },
          short_description_zh_cn: { type: 'string', description: '簡中簡述（可選；分類 tooltip 用）' },
          description_en: { type: 'string', description: '英文描述（可選）' },
          description_ja: { type: 'string', description: '日文描述（可選）' },
          description_ko: { type: 'string', description: '韓文描述（可選）' },
          description_zh_cn: { type: 'string', description: '簡中描述（可選）' },
        },
        required: ['name'],
        additionalProperties: false,
      },
      handler: (a) =>
        api.request('POST', '/api/admin/categories', {
          body: pick(a, [
            'name',
            'description',
            'slug',
            'short_description',
            'name_en',
            'name_ja',
            'name_ko',
            'name_zh_cn',
            'short_description_en',
            'short_description_ja',
            'short_description_ko',
            'short_description_zh_cn',
            'description_en',
            'description_ja',
            'description_ko',
            'description_zh_cn',
          ]),
        }),
    },
    {
      name: 'koimsurai_update_category',
      description: '更新分類。id 必填，其餘只送要改的。',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'number' },
          name: { type: 'string' },
          description: { type: 'string' },
          slug: { type: 'string' },
          short_description: { type: 'string' },
          name_en: { type: 'string', description: '英文顯示名（可選；不影響資料鍵）' },
          name_ja: { type: 'string', description: '日文顯示名（可選）' },
          name_ko: { type: 'string', description: '韓文顯示名（可選）' },
          name_zh_cn: { type: 'string', description: '簡中顯示名（可選）' },
          short_description_en: { type: 'string', description: '英文簡述（可選；分類 tooltip 用）' },
          short_description_ja: { type: 'string', description: '日文簡述（可選；分類 tooltip 用）' },
          short_description_ko: { type: 'string', description: '韓文簡述（可選；分類 tooltip 用）' },
          short_description_zh_cn: { type: 'string', description: '簡中簡述（可選；分類 tooltip 用）' },
          description_en: { type: 'string', description: '英文描述（可選）' },
          description_ja: { type: 'string', description: '日文描述（可選）' },
          description_ko: { type: 'string', description: '韓文描述（可選）' },
          description_zh_cn: { type: 'string', description: '簡中描述（可選）' },
        },
        required: ['id'],
        additionalProperties: false,
      },
      handler: (a) =>
        api.request('PUT', `/api/admin/categories/${idOf(a)}`, {
          body: pick(a, [
            'name',
            'description',
            'slug',
            'short_description',
            'name_en',
            'name_ja',
            'name_ko',
            'name_zh_cn',
            'short_description_en',
            'short_description_ja',
            'short_description_ko',
            'short_description_zh_cn',
            'description_en',
            'description_ja',
            'description_ko',
            'description_zh_cn',
          ]),
        }),
    },
    {
      name: 'koimsurai_delete_category',
      description: '⚠️ 刪除分類（不影響文章本身的 category 字串）。',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'number' } },
        required: ['id'],
        additionalProperties: false,
      },
      handler: (a) => api.request('DELETE', `/api/admin/categories/${idOf(a)}`),
    },

    // ── 標籤 ──────────────────────────────────────────────────
    {
      name: 'koimsurai_list_tags',
      description: '列出所有標籤（含使用篇數 post_count）。',
      inputSchema: EMPTY,
      handler: () => api.request('GET', '/api/admin/tags'),
    },
    {
      name: 'koimsurai_create_tag',
      description: '建立標籤。name 必填。',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '標籤名（同時是資料鍵：文章的標籤關聯與前台篩選都比對它）' },
          name_en: { type: 'string', description: '英文顯示名（可選；不影響資料鍵）' },
          name_ja: { type: 'string', description: '日文顯示名（可選）' },
          name_ko: { type: 'string', description: '韓文顯示名（可選）' },
          name_zh_cn: { type: 'string', description: '簡中顯示名（可選）' },
          short_description_en: { type: 'string', description: '英文簡述（可選；分類 tooltip 用）' },
          short_description_ja: { type: 'string', description: '日文簡述（可選；分類 tooltip 用）' },
          short_description_ko: { type: 'string', description: '韓文簡述（可選；分類 tooltip 用）' },
          short_description_zh_cn: { type: 'string', description: '簡中簡述（可選；分類 tooltip 用）' },
          description_en: { type: 'string', description: '英文描述（可選）' },
          description_ja: { type: 'string', description: '日文描述（可選）' },
          description_ko: { type: 'string', description: '韓文描述（可選）' },
          description_zh_cn: { type: 'string', description: '簡中描述（可選）' },
        },
        required: ['name'],
        additionalProperties: false,
      },
      handler: (a) =>
        api.request('POST', '/api/admin/tags', {
          body: pick(a, ['name', 'name_en', 'name_ja', 'name_ko', 'name_zh_cn']),
        }),
    },
    {
      name: 'koimsurai_update_tag',
      description: '重新命名標籤 / 補多語系顯示名。id + name 必填。',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'number' },
          name: { type: 'string', description: '標籤名（同時是資料鍵）' },
          name_en: { type: 'string', description: '英文顯示名（可選；不影響資料鍵）' },
          name_ja: { type: 'string', description: '日文顯示名（可選）' },
          name_ko: { type: 'string', description: '韓文顯示名（可選）' },
          name_zh_cn: { type: 'string', description: '簡中顯示名（可選）' },
        },
        required: ['id', 'name'],
        additionalProperties: false,
      },
      handler: (a) =>
        api.request('PUT', `/api/admin/tags/${idOf(a)}`, {
          body: pick(a, ['name', 'name_en', 'name_ja', 'name_ko', 'name_zh_cn']),
        }),
    },
    {
      name: 'koimsurai_delete_tag',
      description: '⚠️ 刪除標籤（連同 post_tags 關聯）。',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'number' } },
        required: ['id'],
        additionalProperties: false,
      },
      handler: (a) => api.request('DELETE', `/api/admin/tags/${idOf(a)}`),
    },

    // ── 碎念 thoughts ─────────────────────────────────────────
    {
      name: 'koimsurai_create_thought',
      description:
        '發一則碎念（短想法 feed）。content 必填；refUrl 給連結會自動抓 OG 卡片。verb 是前台「Koimsurai 看了／讀了…」的動詞（存 key，五個語系各自翻）。',
      inputSchema: {
        type: 'object',
        properties: {
          content: { type: 'string' },
          refUrl: { type: 'string', description: '附帶連結（可選，會 unfurl）' },
          verb: {
            type: 'string',
            enum: ['watched', 'read', 'listened', 'played', 'shared'],
            description: '動詞（可選）；分享連結用 shared',
          },
        },
        required: ['content'],
        additionalProperties: false,
      },
      handler: (a) => api.request('POST', '/api/admin/thoughts', { body: pick(a, ['content', 'refUrl', 'verb']) }),
    },
    {
      name: 'koimsurai_update_thought',
      description: '更新碎念。id 必填；clearRef=true 可清掉原本的連結卡片；verb 給空字串是拿掉動詞。',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'number' },
          content: { type: 'string' },
          refUrl: { type: 'string' },
          clearRef: { type: 'boolean' },
          verb: { type: 'string', enum: ['', 'watched', 'read', 'listened', 'played', 'shared'] },
        },
        required: ['id'],
        additionalProperties: false,
      },
      handler: (a) =>
        api.request('PUT', `/api/admin/thoughts/${idOf(a)}`, {
          body: pick(a, ['content', 'refUrl', 'clearRef', 'verb']),
        }),
    },
    {
      name: 'koimsurai_delete_thought',
      description: '⚠️ 刪除碎念。',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'number' } },
        required: ['id'],
        additionalProperties: false,
      },
      handler: (a) => api.request('DELETE', `/api/admin/thoughts/${idOf(a)}`),
    },

    // ── gallery ───────────────────────────────────────────────
    {
      name: 'koimsurai_gallery_sync',
      description:
        '觸發 NAS 相簿同步：掃來源 → 產 webp（1920/400）+ EXIF + thumbhash → 寫 manifest。' +
        '耗時（視新增照片數），同時只跑一個。',
      inputSchema: EMPTY,
      handler: () => api.request('POST', '/api/admin/gallery/sync'),
    },
  ];
}
