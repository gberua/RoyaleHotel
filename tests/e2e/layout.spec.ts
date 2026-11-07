import { expect, test, type Page } from "@playwright/test";

/**
 * Phone layout: nothing may run past the right edge of the screen (the page clips sideways overflow, so it would
 * simply be cut off). Georgian labels are the longest, so the Georgian pages are the ones that break first.
 */
// the narrowest common phone (iPhone SE / mini); the Georgian cookie buttons still fit on wider phones
test.use({ viewport: { width: 375, height: 812 } });

async function offScreen(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll("body *")]
      .filter((e) => {
        const r = e.getBoundingClientRect();
        // horizontally scrolling rows (tabs, carousels) may extend past the edge on purpose
        return r.width > 0 && r.right > window.innerWidth + 1 && !e.closest("[class*=overflow-x],[class*=snap-x],[class*=overflow-hidden]");
      })
      .map((e) => `${e.tagName}.${String(e.className).slice(0, 40)} → ${Math.round(e.getBoundingClientRect().right)}px`),
  );
}

// "/ka/…" pins Georgian (an unprefixed URL follows the browser's language, which is English in the test browser)
for (const [path, lang] of [["/ka", "ka"], ["/ka/policies/cancellation", "ka"], ["/en/policies/cancellation", "en"], ["/ru/policies/cancellation", "ru"]]) {
  test(`phone: nothing runs off the screen on ${path} (cookie banner included)`, async ({ page, isMobile }) => {
    test.skip(!isMobile, "phone layout");
    await page.context().clearCookies(); // first visit: the cookie banner shows
    await page.goto(path);
    await expect(page.locator("html")).toHaveAttribute("lang", lang);
    await expect(page.getByRole("dialog")).toBeVisible(); // cookie banner
    expect(await offScreen(page)).toEqual([]);
  });
}

test("policy headings are real headings, never raw '## ' text", async ({ page }) => {
  for (const path of ["/ka/policies/cancellation", "/en/policies/cancellation", "/ru/policies/cancellation"]) {
    await page.goto(path);
    const article = page.locator("article");
    await expect(article.locator("h2").first()).toBeVisible();
    await expect(article).not.toContainText("## ");
  }
});
