import { expect, test, type Page } from "@playwright/test";

/**
 * Full guest journey against the real app + database:
 * search → select room → extras → details → review → mock card payment → confirmation
 * → booking visible in admin (list, detail, calendar) → guest cancels via Manage booking → admin shows it cancelled.
 */
const iso = (d: Date) => d.toISOString().slice(0, 10);
// a unique far-future stay per run (avoids collisions with earlier runs / real data)
const offset = 120 + (Math.floor(Date.now() / 60_000) % 200);
const checkIn = iso(new Date(Date.now() + offset * 86_400_000));
const checkOut = iso(new Date(Date.now() + (offset + 3) * 86_400_000));

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => localStorage.setItem("rh_consent", "essential"));
});

async function adminLogin(page: Page) {
  await page.goto("/admin/login");
  await page.fill("#email", process.env.SEED_OWNER_EMAIL!);
  await page.fill("#password", process.env.SEED_OWNER_PASSWORD!);
  await page.click("button[type=submit]");
  await page.waitForURL((u) => !u.pathname.startsWith("/admin/login"));
}

test("guest books and pays, hotel sees it, guest cancels", async ({ page, browser, isMobile }) => {
  // ── entry: the Book button opens the booking drawer ──
  await page.goto("/en");
  const bookBtn = isMobile ? page.getByRole("banner").getByRole("link", { name: "Book" }) : page.getByRole("banner").getByRole("link", { name: "Book" });
  await bookBtn.click();
  await expect(page.getByRole("dialog", { name: "Book your stay" })).toBeVisible();
  await page.keyboard.press("Escape");

  // ── search (deep link into the same flow) ──
  await page.goto(`/en/book?checkIn=${checkIn}&checkOut=${checkOut}&adults=2`);
  const add = page.getByRole("button", { name: /^Add$/ }).first();
  await expect(add).toBeVisible();
  await add.click();
  await page.getByRole("button", { name: /^Continue/ }).click();

  // ── extras: breakfast for everyone ──
  await expect(page.getByText("Make your stay easier")).toBeVisible();
  await expect(page.getByRole("timer")).toContainText("held");
  const breakfast = page.locator("li").filter({ hasText: "Breakfast" });
  await breakfast.getByRole("button", { name: /^Increase/ }).click();
  await page.getByRole("button", { name: /^Continue/ }).click();

  // ── guest details ──
  await page.fill("#g-firstName", "E2E");
  await page.fill("#g-lastName", `Guest${offset}`);
  await page.fill("#g-email", `e2e+${Date.now()}@example.test`);
  await page.fill("#g-phone", "+995 555 00 11 22");
  await page.selectOption("#g-arrival", "16:00");
  await page.getByRole("button", { name: /^Continue/ }).click();

  // ── review: server-computed breakdown, pay in full ──
  const total = page.getByTestId("grand-total");
  await expect(total).toContainText("₾");
  await expect(page.getByText("Breakfast ×1")).toBeVisible();
  await page.getByLabel(/Pay in full now/).check();
  await page.getByRole("checkbox", { name: /I accept/ }).check();
  await page.getByTestId("submit-booking").click();

  // ── mock card page → success ──
  await page.waitForURL("**/pay/mock**");
  await page.getByRole("button", { name: "Simulate successful payment" }).click();
  await page.waitForURL("**/booking/return**");
  await expect(page.getByRole("heading", { name: "Your booking is confirmed" })).toBeVisible();
  const code = (await page.getByTestId("booking-code").innerText()).trim();
  expect(code).toMatch(/^RH-\d{4}-\d{4,}$/);
  await expect(page.getByTestId("booking-status")).toHaveText("Confirmed");
  const pdf = await page.request.get("/api/booking/voucher");
  expect(pdf.headers()["content-type"]).toBe("application/pdf");

  // ── hotel side (separate browser session) ──
  const staff = await (await browser.newContext()).newPage();
  await adminLogin(staff);
  await staff.goto(`/admin/bookings?q=${code}`);
  const row = staff.getByTestId("bookings-table").locator("tr", { hasText: code });
  await expect(row.locator("[data-status]")).toHaveAttribute("data-status", "CONFIRMED");
  await expect(row).toContainText(`Guest${offset}`);
  await row.getByRole("link", { name: code }).click();
  // the admin speaks the staff member's language, so check language-independent facts
  await expect(staff.getByRole("heading", { level: 1 })).toContainText(code);
  await expect(staff.getByText(/succeeded|წარმატებული|успешно/).first()).toBeVisible();
  await staff.goto(`/admin/calendar?start=${checkIn}&days=14`);
  await expect(staff.getByTestId("timeline").getByRole("link", { name: new RegExp(code) })).toBeVisible();

  // ── guest cancels via Manage booking (free cancellation → full refund) ──
  await page.goto("/en/booking/manage");
  await expect(page.getByTestId("refund-amount")).toContainText("Refund to you");
  await page.getByRole("button", { name: "Cancel booking" }).click();
  await page.getByRole("button", { name: "Cancel booking" }).last().click();
  await expect(page.getByTestId("cancelled-message")).toBeVisible();

  // ── admin sees the cancellation ──
  await staff.goto(`/admin/bookings?q=${code}&status=CANCELLED`);
  await expect(staff.getByTestId("bookings-table").locator("tr", { hasText: code }).locator("[data-status]")).toHaveAttribute("data-status", "CANCELLED");
  await staff.close();
});

test("declined card keeps the room held and offers a retry", async ({ page }) => {
  const ci = iso(new Date(Date.now() + (offset + 10) * 86_400_000));
  const co = iso(new Date(Date.now() + (offset + 13) * 86_400_000)); // 3 nights: allowed even in high season
  await page.goto(`/en/book?checkIn=${ci}&checkOut=${co}&adults=2`);
  await page.getByRole("button", { name: /^Add$/ }).first().click();
  await page.getByRole("button", { name: /^Continue/ }).click();
  await page.getByRole("button", { name: /^Continue/ }).click();
  await page.fill("#g-firstName", "Declined");
  await page.fill("#g-lastName", "Card");
  await page.fill("#g-email", `declined+${Date.now()}@example.test`);
  await page.fill("#g-phone", "+995 555 00 11 33");
  await page.getByRole("button", { name: /^Continue/ }).click();
  await page.getByLabel(/deposit now/).check();
  await page.getByRole("checkbox", { name: /I accept/ }).check();
  await page.getByTestId("submit-booking").click();
  await page.waitForURL("**/pay/mock**");
  await page.getByRole("button", { name: "Simulate declined payment" }).click();
  await page.waitForURL("**/booking/return**");
  await expect(page.getByText("The payment was declined")).toBeVisible();
  await expect(page.getByRole("button", { name: /Continue to payment/ })).toBeVisible();
});

test("an offer's promo code travels with the 'Book this offer' link and is applied at review", async ({ page }) => {
  await page.goto("/en/offers/early-summer");
  await expect(page.getByRole("link", { name: /Book this offer/ })).toHaveAttribute("href", /\/book\?promo=EARLY10$/);
  const ci = iso(new Date(Date.now() + (offset + 12) * 86_400_000)), co = iso(new Date(Date.now() + (offset + 15) * 86_400_000)); // 3 nights: high season has a minimum stay
  await page.goto(`/en/book?promo=EARLY10&checkIn=${ci}&checkOut=${co}&adults=2`);
  await page.getByRole("button", { name: /^Add$/ }).first().click();
  await page.getByRole("button", { name: /^Continue/ }).click();
  await expect(page.getByText("Make your stay easier")).toBeVisible();
  await page.getByRole("button", { name: /^Continue/ }).click();
  await page.fill("#g-firstName", "Promo");
  await page.fill("#g-lastName", "Guest");
  await page.fill("#g-email", `promo+${Date.now()}@example.test`);
  await page.fill("#g-phone", "+995 555 00 11 22");
  await page.getByRole("button", { name: /^Continue/ }).click();
  await expect(page.getByTestId("grand-total")).toContainText("₾");
  await expect(page.locator("#promo")).toHaveValue("EARLY10");
  // the guest is told straight away whether the code counts for these dates — never a silent full price
  await expect(page.getByText(/Promo code applied|can't be used for this stay/i)).toBeVisible(); // which one depends on whether the test dates fall in the offer's stay window
});
