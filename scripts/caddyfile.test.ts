import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vite-plus/test';

import { CSP_POLICY, SECURITY_HEADERS } from './csp.mjs';

// 自架用的 Caddyfile 讀不到 JS，CSP 與安全標頭是從 csp.mjs 手抄的。
// 抄錯的話自架的站會擋到自家東西（或少一道防護），而且沒有人會發現——這裡比對。
// 測試的工作目錄是 repo 根目錄。

const caddyfile = readFileSync('.config/Caddyfile', 'utf8');

describe('.config/Caddyfile', () => {
  it('前端那段的 CSP 跟 scripts/csp.mjs 一字不差', () => {
    expect(caddyfile).toContain(`header Content-Security-Policy "${CSP_POLICY}"`);
  });

  it('四條安全標頭都在，值也一樣', () => {
    const names: Record<string, string> = {
      'strict-transport-security': 'Strict-Transport-Security',
      'x-content-type-options': 'X-Content-Type-Options',
      'x-frame-options': 'X-Frame-Options',
      'referrer-policy': 'Referrer-Policy',
    };
    for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
      expect(caddyfile, key).toContain(`${names[key]} "${value}"`);
    }
  });
});

// 給已經有 nginx 的人用的範例（deploy/nginx/）：一樣是手抄的，一樣比對
const nginxSite = readFileSync('deploy/nginx/sora-to-ki.conf', 'utf8');
const nginxHeaders = readFileSync('deploy/nginx/security-headers.conf', 'utf8');

describe('deploy/nginx', () => {
  it('前端那段的 CSP 跟 scripts/csp.mjs 一字不差', () => {
    expect(nginxSite).toContain(`add_header Content-Security-Policy "${CSP_POLICY}" always;`);
  });

  it('四條安全標頭都在，值也一樣', () => {
    for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
      expect(nginxHeaders.toLowerCase(), key).toContain(`add_header ${key} "${value.toLowerCase()}" always;`);
    }
  });

  it('不沿用讀者帶來的 X-Forwarded-For（後端拿第一個值當讀者的 IP）', () => {
    expect(nginxSite).not.toMatch(/proxy_set_header\s+X-Forwarded-For\s+\$proxy_add_x_forwarded_for/);
    expect(nginxSite).toMatch(/proxy_set_header X-Forwarded-For \$remote_addr;/);
  });
});
