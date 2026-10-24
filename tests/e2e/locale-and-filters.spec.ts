import { expect, test } from './fixtures';

import { E2E_POST_PREFIX } from './seed.mjs';

/**
 * 語言切換與文章篩選——兩批「使用者最常按、但一條測試都沒有」的互動。
 *
 * 語言切換那批特別要緊：`SiteNav.tsx` 的 switchLocale 留了一張字條——
 *
 *   一定要換網址：頁面內容由 LocaleProvider 依「網址」建的 i18n instance 驅動，
 *   只呼叫 changeLanguage 只會換到外殼，內容不會跟著換。
 *
 * 也就是說這裡壞過一次，而且壞的樣子是「網址對、外殼的字換了、內文沒換」。
 * 所以下面每一條都**斷言內容真的變了**，不是只看網址——只看網址的測試在那個
 * bug 重演時會全綠。
 */

/** 頂欄的「更多」：語言在它展開後的工具列裡 */
const MORE = '.snav-row button[aria-controls="snav-more"]';
const LANG = '#snav-more .snav-util-group button[lang]';

/** 打開「更多」。 */
async function openMore(page: import('@playwright/test').Page) {
  await expect(async () => {
    await page.locator(MORE).click();
    await expect(page.locator(MORE)).toHaveAttribute('aria-expanded', 'true', { timeout: 2_000 });
  }).toPass({ timeout: 20_000 }); // hydration 之前那一下會被吃掉，理由同 interactions.spec.ts
}

/** 打開「更多」並選一個語言（code 是 lang 屬性：en、zh-TW…）。 */
async function pickLanguage(page: import('@playwright/test').Page, code: string) {
  await openMore(page);
  await page.locator(`${LANG}[lang="${code}"]`).click();
}

test.describe('語言切換', () => {
  /**
   * 切到英文之後，**內容**要真的是英文。
   *
   * 種子資料裡同一篇文章的中英標題不同（第一篇測試文章 / The first test post），
   * 所以「內文有沒有跟著換」是驗得出來的。這正是註解裡那個 bug 的判準。
   */
  test('切語言會連內容一起換，不只是外殼', async ({ page }) => {
    await page.goto('/blog');
    await expect(page.locator('main').first()).toContainText('第一篇測試文章');

    await pickLanguage(page, 'en');

    await expect(page).toHaveURL(/\/en\/blog\/?$/);
    await expect(page.locator('main').first(), '內文必須跟著換——只換外殼就是那個舊 bug').toContainText(
      'The first test post',
    );
    await expect(page.locator('main').first()).not.toContainText('第一篇測試文章');
  });

  /** 切語言要留在同一頁，不是跳回首頁。 */
  test('切語言保留當前路徑（含帶參數的）', async ({ page }) => {
    await page.goto('/blog/1');
    await pickLanguage(page, 'en');
    await expect(page, '應該是 /en/blog/1 而不是 /en').toHaveURL(/\/en\/blog\/1$/);
  });

  /**
   * 切回預設語系 → **沒有前綴**。
   *
   * `LOCALE_PREFIX['zh-TW']` 是空字串，為的是保留已被索引的舊網址。
   * 少了那個特例會產生 `/zh-tw/blog` 這種不存在的路徑。
   */
  test('切回預設語系不會多出前綴', async ({ page }) => {
    await page.goto('/en/blog');
    await pickLanguage(page, 'zh-TW');
    await expect(page).toHaveURL(/\/blog\/?$/);
    await expect(page).not.toHaveURL(/zh-tw/i);
    await expect(page.locator('main').first()).toContainText('第一篇測試文章');
  });

  /** 目前語系要標 `aria-current`——沒有它，用報讀器的人不知道現在是哪一個。 */
  test('目前語系有標記出來', async ({ page }) => {
    await page.goto('/en/blog');
    await openMore(page);

    const current = page.locator(`${LANG}[aria-current="true"]`);
    await expect(current, '應該只有一個被標成目前語系').toHaveCount(1);
    await expect(current).toHaveAttribute('lang', 'en');
  });

  /** Esc 收起「更多」。 */
  test('Esc 關得掉「更多」', async ({ page }) => {
    await page.goto('/blog');
    await openMore(page);

    await page.keyboard.press('Escape');
    await expect(page.locator(MORE)).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#snav-more')).toHaveAttribute('inert', '');
  });
});

/**
 * 首頁 `/` 依 `Accept-Language` 在 **server 端** 302 到對應語系（src/routes/index.tsx）。
 *
 * 這條路徑決定的是「第一次來的人看到什麼」，而它從來沒有任何測試守著。三個容易壞的點：
 *
 *   · 導錯或不導 —— 日本讀者打開首頁看到中文，而他不會知道有 /ja 可以去
 *   · cookie 沒有優先於瀏覽器設定 —— 使用者明明選過語言，下次回來又被打回去
 *   · **對爬蟲也導** —— 這個最貴：Google 從 `/` 被 302 到 `/en`，等於宣告首頁的
 *     正規版本是英文的，各語系的 hreflang 索引整組錯掉。而站上完全看不出異狀。
 *
 * ⚠ 這一組每個 test 都要自己的 context（Accept-Language 是 context 級的），
 *   所以用 test.use() 開獨立的 describe，不能塞進上面那組。
 */
test.describe('首頁的語言自動導向', () => {
  for (const [locale, expected] of [
    ['ja-JP', '/ja'],
    ['ko-KR', '/ko'],
    ['en-US', '/en'],
  ] as const) {
    test.describe(`${locale} 的瀏覽器`, () => {
      test.use({ locale });
      test(`打開首頁會被送到 ${expected}`, async ({ page }) => {
        await page.goto('/');
        await expect(page).toHaveURL(new RegExp(`${expected}$`), { timeout: 15_000 });
        await expect(page.locator('html')).toHaveAttribute('lang', expected.slice(1));
      });
    });
  }

  test.describe('zh-TW 的瀏覽器', () => {
    test.use({ locale: 'zh-TW' });
    test('留在沒有前綴的首頁', async ({ page }) => {
      await page.goto('/');
      // 預設語系不該多一層 /zh-tw 前綴——多了的話正規網址就變成兩個
      await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
      await expect(page.locator('html')).toHaveAttribute('lang', 'zh-TW');
    });
  });

  test.describe('選過語言的人', () => {
    test.use({ locale: 'en-US' });
    test('cookie 優先於瀏覽器的 Accept-Language', async ({ page, context, baseURL }) => {
      // 使用者在語言選單選過日文 → 之後即使瀏覽器仍宣稱 en-US，也該回到日文
      expect(baseURL, 'playwright.config.ts 應該有設 baseURL').toBeTruthy();
      await context.addCookies([{ name: 'koim_locale', value: 'ja', url: String(baseURL) }]);
      await page.goto('/');
      await expect(page, 'cookie 沒有蓋過 Accept-Language').toHaveURL(/\/ja$/, { timeout: 15_000 });
    });
  });

  test.describe('爬蟲', () => {
    test.use({
      locale: 'en-US',
      userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    });
    test('不導向，停在預設語系的首頁', async ({ page }) => {
      await page.goto('/');
      await expect(page, '爬蟲被 302 走的話，首頁的正規版本就會變成別的語系，hreflang 整組錯掉').toHaveURL(/\/$/, {
        timeout: 15_000,
      });
      await expect(page.locator('html')).toHaveAttribute('lang', 'zh-TW');
    });
  });
});

test.describe('文章篩選', () => {
  // 手記一篇一列（`.nt-list > li`）。全文搜尋在命令面板（⌘K，見 nav.spec.ts），這頁只有分類與標籤。
  //
  // 排掉測試自己建的文章：post-editor.spec.ts 有一條會真的發佈一篇，而跨檔是平行跑的。
  // 下面幾條都是「先數一次 before，做點事，再數一次」——中間插進來一篇就會紅，
  // 而且是那種跑十次紅一次、最難查的紅。改成從來源就不看它們，比縮短競爭窗口可靠。
  const rows = (page: import('@playwright/test').Page) =>
    page.locator('.nt-list > li').filter({ hasNotText: E2E_POST_PREFIX });
  /** 分類按鈕（第一顆是「全部」，沒有 aria-pressed） */
  const category = (page: import('@playwright/test').Page, name: string) =>
    page.locator('.nt-cats button[aria-pressed]').filter({ hasText: name });

  /** 點分類 → 只剩該分類，按鈕標成按下；再點一次回到全部。 */
  test('點分類會篩選，再點一次還原', async ({ page }) => {
    await page.goto('/blog');
    const before = await rows(page).count();
    expect(before, '種子資料應該有多篇文章，否則這條測不出東西').toBeGreaterThan(1);

    const life = category(page, '生活');
    await life.click();
    await expect(life).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => rows(page).count(), { message: '篩選後應該變少' }).toBeLessThan(before);
    for (const meta of await rows(page).locator('.nt-meta').all()) await expect(meta).toContainText('生活');

    await life.click();
    await expect(life).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(() => rows(page).count(), { message: '取消後應該全部回來' }).toBe(before);
  });

  /** 從文章的標籤點進來（`?tag=`）：清單只剩那個標籤，而且有一顆清得掉的標籤條件。 */
  test('標籤條件看得到，也清得掉', async ({ page }) => {
    await page.goto('/blog');
    const before = await rows(page).count();

    await page.goto('/blog?tag=rust');
    const chip = page.locator('.nt-tag');
    await expect(chip, '要讓使用者看得出來清單被篩過').toContainText('rust');
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first()).toContainText('第一篇測試文章');

    await chip.click();
    await expect(chip).toBeHidden();
    await expect.poll(() => rows(page).count()).toBe(before);
  });

  /**
   * 分類與標籤是**交集**不是聯集，篩到沒有東西時顯示空狀態，而不是一片空白讓人以為壞了。
   *
   * 兩個條件在同一個 `filterPosts` 裡用 `&&` 串起來。改成 `||` 的話畫面看起來「有東西」
   * 所以不容易察覺，但使用者篩了兩個條件卻拿到更多結果。
   * rust 只掛在「技術」的第一篇上，所以「生活」＋rust 必定是空的。
   */
  test('分類與標籤同時套用時取交集，沒有結果時顯示空狀態', async ({ page }) => {
    await page.goto('/blog?tag=rust');
    await expect(rows(page)).toHaveCount(1);

    await category(page, '生活').click();
    await expect(page.locator('.nt-empty')).toBeVisible();
    await expect(rows(page)).toHaveCount(0);
  });
});
