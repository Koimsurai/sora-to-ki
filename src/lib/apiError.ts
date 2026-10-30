// 後端擋下來的錯誤，換成看的人的語言。
//
// 後端回 `{ error, code, params }`（backend/src/error.rs 的 Problem）：`error` 是英文說明，
// `code` 是固定的代號，`params` 是要填進翻譯的值（上限幾個字、哪個欄位…）。
// 有 `code`、而且字串檔裡有那句（前台 `apiError.<code>`、後台 `errors.<code>`）就用翻譯；
// 沒有就顯示後端的英文說明，再沒有才用呼叫端給的 fallback。
//
// `params.field` 是欄位的英文 key（`chapterTitle`…），也照 `<prefix>.field.<key>` 換成那個語言的欄位名。

type Translate = (key: string, options: Record<string, unknown> & { defaultValue: string }) => string;

interface ApiErrorBody {
  error?: unknown;
  message?: unknown;
  code?: unknown;
  params?: unknown;
}

const text = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined);

/**
 * @param body   後端回的 JSON（壞掉、不是物件都行）
 * @param prefix 字串檔裡的那一段：前台 `apiError`、後台 `errors`
 */
export function apiErrorText(body: unknown, t: Translate, prefix: string, fallback: string): string {
  const b = (body && typeof body === 'object' ? body : {}) as ApiErrorBody;
  // auth 那幾支用 message 放說明（對齊舊的 Express），其他用 error
  const english = text(b.error) ?? text(b.message) ?? fallback;
  const code = text(b.code);
  if (!code) return english;
  const params: Record<string, unknown> =
    b.params && typeof b.params === 'object' ? { ...(b.params as Record<string, unknown>) } : {};
  const field = text(params.field);
  if (field) params.field = t(`${prefix}.field.${field}`, { defaultValue: field });
  return t(`${prefix}.${code}`, { ...params, defaultValue: english });
}
