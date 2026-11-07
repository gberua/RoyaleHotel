import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";

/**
 * Admin panel flows in a real browser against the running app. Everything a test changes is undone at the end.
 * Uses the seeded owner account (SEED_OWNER_EMAIL / SEED_OWNER_PASSWORD from .env).
 */
const iso = (d: Date) => d.toISOString().slice(0, 10);
// far-future dates, different per project so desktop and mobile runs never edit the same nights
const farStart = (project: string) => iso(new Date(Date.now() + (500 + (project === "mobile" ? 150 : project.endsWith("-drag") ? -230 : 0) + (Math.floor(Date.now() / 60_000) % 100)) * 86_400_000));

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
  const firstOld = (await cells.nth(1).locator("span").first().textContent())?.trim(); // first night of the selection
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
  await expect(preview.locator("tbody tr").first()).toContainText(`${firstOld}`);
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

test("calendar: drag a booking to another room, confirm, then documents download", async ({ page, isMobile }, info) => {
  test.skip(isMobile, "dragging is a desktop interaction (phones tap to open)");
  await login(page);
  const ci = farStart(info.project.name + "-drag");
  const co = iso(new Date(Date.parse(ci) + 2 * 86_400_000));
  // a phone booking far in the future, created through the admin form
  await page.goto(`/admin/bookings/new?checkIn=${ci}&checkOut=${co}`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /availability|თავისუფალი|наличие/i }).click();
  await expect(page.locator("aside dl")).toBeVisible();
  const inputs = page.locator("section").nth(1).locator("input");
  await inputs.nth(0).fill("Drag");
  await inputs.nth(1).fill("Test");
  await inputs.nth(2).fill("+995 555 000 111");
  await page.getByRole("button", { name: /Create confirmed|დადასტურებული ჯავშნის შექმნა|Создать подтверждённую/ }).click();
  await page.waitForURL(/\/admin\/bookings\/RH-/);
  const code = decodeURIComponent(page.url().split("/").pop()!);

  // documents
  for (const doc of ["registration", "invoice"]) {
    const res = await page.request.get(`/admin/bookings/${code}/${doc}?lang=ka`);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("application/pdf");
    expect((await res.body()).subarray(0, 4).toString()).toBe("%PDF");
  }

  await page.goto(`/admin/calendar?start=${ci}&days=14`);
  await page.waitForLoadState("networkidle");
  const bar = page.getByTestId("timeline-bar").filter({ hasText: code });
  const fromRow = bar.locator("xpath=ancestor::*[@data-room-row][1]");
  const fromRoom = await fromRow.getAttribute("data-room-row");
  const rows = page.locator("[data-room-row]");
  const count = await rows.count();
  // drag into the first other room row that has nothing booked in this window
  let target = -1;
  for (let i = 0; i < count && target < 0; i++) {
    if ((await rows.nth(i).getAttribute("data-room-row")) !== fromRoom && (await rows.nth(i).getByTestId("timeline-bar").count()) === 0) target = i;
  }
  const box = (await bar.boundingBox())!;
  const tBox = (await rows.nth(target).boundingBox())!;
  await page.mouse.move(box.x + 10, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 14, tBox.y + tBox.height / 2, { steps: 8 });
  await page.mouse.up();
  const dialog = page.getByTestId("move-dialog");
  await expect(dialog).toContainText(code);
  await dialog.getByRole("button").last().click();
  await expect(dialog).toHaveCount(0);
  const targetRoom = await rows.nth(target).getAttribute("data-room-row");
  await expect.poll(() => page.getByTestId("timeline-bar").filter({ hasText: code }).locator("xpath=ancestor::*[@data-room-row][1]").getAttribute("data-room-row")).toBe(targetRoom);

  // clean up: cancel the test booking
  await page.goto(`/admin/bookings/${code}`);
  await page.waitForLoadState("networkidle");
  page.once("dialog", (d) => d.accept());
  await page.locator('input[name="refundMode"][value="none"]').check();
  await page.locator('input[name="notifyGuest"]').uncheck();
  await page.locator("form").filter({ has: page.locator('input[name="refundMode"]') }).getByRole("button").click();
  await expect(page.locator("[data-status]").first()).toHaveAttribute("data-status", "CANCELLED");
});
