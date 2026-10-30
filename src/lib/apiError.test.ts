import { describe, expect, it } from 'vite-plus/test';
import { apiErrorText } from './apiError';

// 假的 t：字串檔裡只有這幾句，{{x}} 照 params 填
const messages: Partial<Record<string, string>> = {
  'errors.text_too_long': '{{field}} 超過 {{max}} 字',
  'errors.field.chapterTitle': '章節標題',
  'errors.tag_exists': '標籤已存在',
};
const t = (key: string, o: Record<string, unknown> & { defaultValue: string }) => {
  const m = messages[key];
  return m === undefined ? o.defaultValue : m.replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(o[k]));
};

describe('後端錯誤換成看的人的語言', () => {
  it('有 code 而且有翻譯：用翻譯，欄位名也換', () => {
    const body = {
      error: 'chapterTitle is over 600 characters',
      code: 'text_too_long',
      params: { field: 'chapterTitle', max: 600 },
    };
    expect(apiErrorText(body, t, 'errors', 'x')).toBe('章節標題 超過 600 字');
  });

  it('沒有那句翻譯：用後端的英文；欄位名沒有翻譯就留 key', () => {
    expect(apiErrorText({ error: 'Post not found', code: 'post_missing' }, t, 'errors', 'x')).toBe('Post not found');
  });

  it('沒有 code：用 error，再沒有用 message（auth），都沒有用 fallback', () => {
    expect(apiErrorText({ error: 'nope' }, t, 'errors', 'x')).toBe('nope');
    expect(apiErrorText({ message: 'Invalid token' }, t, 'errors', 'x')).toBe('Invalid token');
    expect(apiErrorText({}, t, 'errors', '儲存失敗')).toBe('儲存失敗');
    expect(apiErrorText(null, t, 'errors', '儲存失敗')).toBe('儲存失敗');
    expect(apiErrorText('壞掉的 body', t, 'errors', '儲存失敗')).toBe('儲存失敗');
  });

  it('沒有 params 也照樣翻', () => {
    expect(apiErrorText({ error: 'Tag already exists', code: 'tag_exists' }, t, 'errors', 'x')).toBe('標籤已存在');
  });
});
