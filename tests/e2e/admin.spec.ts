import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";

/**
 * Admin panel flows in a real browser against the running app. Everything a test changes is undone at the end.
 * Uses the seeded owner account (SEED_OWNER_EMAIL / SEED_OWNER_PASSWORD from .env).
 */
const iso = (d: Date) => d.toISOString().slice(0, 10);
// far-future dates, different per project so desktop and mobile runs never edit the same nights
const farStart = (project: string) => iso(new Date(Date.now() + (500 + (project === "mobile" ? 150 : 0) + (Math.floor(Date.now() / 60_000) % 100)) * 86_400_000));

async function login(page: Page) {
  await page.goto("/admin/login");
  await page.fill("#email", process.env.SEED_OWNER_EMAIL!);
  await page.fill("#password", process.env.SEED_OWNER_PASSWORD!);
  await page.click("button[type=submit]");
  await page.waitForURL((u) => !u.pathname.startsWith("/admin/login"));
}

test("rate calendar: select dates → preview old → new → apply → undo", async ({ page, isMobile }, info) => {
  await login(page);
  await page.goto(`/admin/rates?start=${farStart(info.project.name)}`);
  const grid = page.getByTestId("rate-grid");
  const row = grid.locator("tbody tr").first();
  const cells = row.locator("td");
  await page.waitForLoadState("networkidle"); // React must be hydrated before we drag
  const before = (await cells.nth(2).locator("span").first().textContent())?.trim();
  if (isMobile) {
    await cells.nth(1).tap();
    await cells.nth(3).tap();
  } else {
    await cells.nth(1).hover();
    await page.mouse.down();
    await cells.nth(3).hover();
    await page.mouse.up();
  }
  const panel = page.locator("aside").filter({ hasText: /Selection|მონიშნული|Выделение/ });
  await panel.locator("select[name=op]").selectOption("set");
  await panel.locator("input[name=value]").fill("333");
  await panel.locator("form button").last().click(); // Preview
  const preview = page.getByTestId("rate-preview");
  await expect(preview).toContainText("3");
  await expect(preview.locator("tbody tr")).toHaveCount(3);
  await expect(preview.locator("tbody tr").first()).toContainText(`${before}`);
  await expect(preview.locator("tbody tr").first()).toContainText("333");
  await preview.getByRole("button").click(); // Apply
  await expect(cells.nth(2).locator("span").first()).toHaveText("333");

  // undo: same selection → "remove changes"
  if (isMobile) { await cells.nth(1).tap(); await cells.nth(3).tap(); }
  else { await cells.nth(1).hover(); await page.mouse.down(); await cells.nth(3).hover(); await page.mouse.up(); }
  await panel.locator("select[name=op]").selectOption("clear");
  await panel.locator("form button").last().click();
  await page.getByTestId("rate-preview").getByRole("button").click();
  await expect(cells.nth(2).locator("span").first()).toHaveText(`${before}`);
});

test("media library: drag-drop upload converts the photo, then delete it", async ({ page, isMobile }) => {
  test.skip(isMobile, "upload flow covered on desktop");
  await login(page);
  await page.goto("/admin/media?unused=1");
  await page.waitForLoadState("networkidle");
  const png = await sharp({ create: { width: 1600, height: 1000, channels: 3, background: { r: 20, g: 184, b: 196 } } }).png().toBuffer();
  const name = `e2e-upload-${Date.now()}.png`;
  await page.getByTestId("media-file").setInputFiles({ name, mimeType: "image/png", buffer: png });
  await expect(page.getByRole("status").filter({ hasText: /1/ })).toBeVisible();
  const card = page.getByTestId("media-card").filter({ hasText: name });
  await expect(card).toBeVisible();
  await expect(card).toContainText("1600×1000");
  const src = await card.locator("img").first().getAttribute("src");
  expect(src).toContain(".webp");
  await card.locator("summary").click();
  page.once("dialog", (d) => d.accept());
  await card.getByRole("button", { name: /Delete|წაშლა|Удалить/ }).click();
  await expect(card).toHaveCount(0);
});

test("website content: a draft is visible only in preview until published", async ({ page, context, isMobile }) => {
  test.skip(isMobile, "covered on desktop");
  await login(page);
  const marker = `E2E draft ${Date.now()}`;
  await page.goto("/admin/content/pages/faq");
  await page.waitForLoadState("networkidle");
  const intro = page.locator('textarea[name="intro.en"]');
  await page.getByRole("tab", { name: "EN" }).nth(1).click();
  await intro.fill(marker);
  await page.getByRole("button", { name: /Save draft|დრაფტის შენახვა|Сохранить черновик/ }).click();
  await expect(page.getByText(/Unpublished draft|გამოუქვეყნებელი დრაფტი|Неопубликованный черновик/)).toBeVisible();

  // a visitor (no draft-mode cookie) still sees the published page
  const visitor = await context.browser()!.newContext();
  const v = await visitor.newPage();
  await v.goto("/en/faq");
  await expect(v.locator("body")).not.toContainText(marker);
  await visitor.close();

  // staff preview shows the draft
  const preview = await context.newPage();
  await preview.goto(`/admin/preview?path=${encodeURIComponent("/en/faq")}`);
  await expect(preview.locator("body")).toContainText(marker);
  await expect(preview.getByRole("status").filter({ hasText: "PREVIEW" })).toBeVisible();
  await preview.getByRole("button", { name: "Exit preview" }).click();
  await preview.close();

  // throw the draft away again
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: /Discard draft|დრაფტის წაშლა|Удалить черновик/ }).click();
  await expect(page.getByText(/No unpublished changes|გამოუქვეყნებელი ცვლილებები არ არის|Неопубликованных изменений нет/)).toBeVisible();
});
