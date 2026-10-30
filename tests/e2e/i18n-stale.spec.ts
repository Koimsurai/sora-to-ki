/**
 * 後台頁面編輯器的「譯文可能過期」：原文（繁中）改過、某個語系還是對著舊原文寫的，就要標出來。
 *
 * 2026-10 正式站的關於頁就是這樣壞的：繁中改成新文案，其他語系還是舊的長文案，後台什麼都沒說。
 * 關於頁的內容在這裡攔下來給一份「英文對著舊原文翻」的資料，不動 e2e 的資料庫（前台的計算後樣式基準讀它）。
 */

import { expect, test } from './fixtures';

import { gotoAdminUntil } from './admin-session';
import { fingerprint } from '../../src/lib/i18nSync';

const about = {
  chapters: [
    {
      year: '2004',
      // 英文是對著「出生」翻的，繁中後來改成了「2004 年，雲林。」
      title: { 'zh-TW': '2004 年，雲林。', en: 'Born', _src: `en:${fingerprint('出生')}` },
      subtitle: {},
      line: {},
    },
  ],
  skills: [],
  jobs: [],
  quote: null,
};

test('原文改過的那一格，英文標「可能過期」，按「已對過」就消掉', async ({ page }) => {
  await page.route('**/api/pages/about', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(about) }),
  );
  await gotoAdminUntil(page, '/admin/pages?tab=about', (p) => p.getByRole('button', { name: /English/ }));

  const english = page.getByRole('button', { name: /English/ });
  await expect(english).toContainText('1 句可能過期');
  await english.click();
  const notice = page.getByText('繁中改過了，這句是對著舊的寫的');
  await expect(notice).toBeVisible();

  await page.getByRole('button', { name: '已對過' }).click();
  await expect(notice).toBeHidden();
  await expect(english).not.toContainText('可能過期');
});
