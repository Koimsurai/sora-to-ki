// 登入 token 的存放與 Authorization 標頭。AuthContext 負責寫入與清除，其餘地方只讀。
//
// 以前後台十幾處各自 `localStorage.getItem('koimsurai_user_token')` 再拼 Bearer，
// 拼法有三種，其中 `Bearer ${token}` 在沒登入時會送出字面的 "Bearer null"。

export const TOKEN_KEY = 'koimsurai_user_token';

export function readToken(): string | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

/**
 * 帶登入 token 的請求標頭；沒登入就不帶 Authorization（後端一樣回 401）。
 * 每次呼叫都重讀 localStorage——session 中途重新登入時才不會繼續送舊的。
 */
export function authHeaders(): Record<string, string> {
  const token = readToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** {@link authHeaders} 再加上 JSON 的 Content-Type。 */
export function jsonAuthHeaders(): Record<string, string> {
  return { 'Content-Type': 'application/json', ...authHeaders() };
}
