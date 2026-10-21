// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vite-plus/test';
import { TOKEN_KEY, authHeaders, jsonAuthHeaders } from './authToken';

describe('authHeaders', () => {
  afterEach(() => localStorage.clear());

  it('沒登入時不帶 Authorization（不是送出 "Bearer null"）', () => {
    expect(authHeaders()).toEqual({});
    expect(jsonAuthHeaders()).toEqual({ 'Content-Type': 'application/json' });
  });

  it('每次都重讀 localStorage，中途換了 token 就送新的', () => {
    localStorage.setItem(TOKEN_KEY, 'first');
    expect(authHeaders()).toEqual({ Authorization: 'Bearer first' });
    localStorage.setItem(TOKEN_KEY, 'second');
    expect(jsonAuthHeaders()).toEqual({ 'Content-Type': 'application/json', Authorization: 'Bearer second' });
  });
});
