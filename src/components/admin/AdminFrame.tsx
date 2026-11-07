import { NextIntlClientProvider } from "next-intl";
import { adminMessages, adminT } from "@/lib/admin-i18n";
import { can, type Permission, type RoleName } from "@/lib/permissions";
import { logout } from "@/app/admin/actions";
import { AdminNav, type NavGroup } from "./AdminNav";

type Item = { href: string; key: string; icon: NavGroup["items"][number]["icon"]; perm: Permission };
const GROUPS: { key: string; items: Item[] }[] = [
  { key: "operations", items: [
    { href: "/admin", key: "dashboard", icon: "LayoutDashboard", perm: "dashboard" },
    { href: "/admin/bookings", key: "bookings", icon: "ClipboardList", perm: "bookings" },
    { href: "/admin/calendar", key: "calendar", icon: "CalendarDays", perm: "calendar" },
    { href: "/admin/bookings/new", key: "newBooking", icon: "Plus", perm: "bookings" },
    { href: "/admin/housekeeping", key: "housekeeping", icon: "Sparkles", perm: "housekeeping" },
    { href: "/admin/guests", key: "guests", icon: "Users", perm: "guests" },
  ] },
  { key: "roomsPrices", items: [
    { href: "/admin/rooms", key: "rooms", icon: "BedDouble", perm: "rooms" },
    { href: "/admin/rates", key: "rates", icon: "CalendarRange", perm: "prices" },
    { href: "/admin/seasons", key: "seasons", icon: "Sun", perm: "prices" },
    { href: "/admin/extras", key: "extras", icon: "Gift", perm: "prices" },
    { href: "/admin/promos", key: "promos", icon: "Tag", perm: "prices" },
  ] },
  { key: "website", items: [
    { href: "/admin/content", key: "content", icon: "FileText", perm: "content" },
    { href: "/admin/media", key: "media", icon: "ImageIcon", perm: "media" },
    { href: "/admin/emails", key: "emails", icon: "Mail", perm: "content" },
    { href: "/admin/reviews", key: "reviews", icon: "Star", perm: "reviews" },
  ] },
  { key: "system", items: [
    { href: "/admin/reports", key: "reports", icon: "BarChart3", perm: "reports" },
    { href: "/admin/channels", key: "channels", icon: "RefreshCw", perm: "channels" },
    { href: "/admin/staff", key: "staff", icon: "UserCog", perm: "staff" },
    { href: "/admin/settings", key: "settings", icon: "Settings", perm: "settings" },
    { href: "/admin/activity", key: "activity", icon: "History", perm: "activity" },
  ] },
];
/** Sections not built yet are hidden from the menu until their phase ships. */
const NOT_YET = new Set(["/admin/guests", "/admin/reports"]);

export async function AdminFrame({ user, title, actions, children, wide = false }: {
  user: { name: string; role: string; adminLocale?: string }; active?: string; title: string; actions?: React.ReactNode; children: React.ReactNode; wide?: boolean;
}) {
  const locale = user.adminLocale ?? "ka";
  const [{ messages }, t] = await Promise.all([adminMessages(locale), adminT(locale)]);
  const groups: NavGroup[] = GROUPS.map((g) => ({
    label: t(`nav.groups.${g.key}`),
    items: g.items.filter((i) => !NOT_YET.has(i.href) && can(user.role as RoleName, i.perm)).map((i) => ({ href: i.href, label: t(`nav.${i.key}`), icon: i.icon })),
  })).filter((g) => g.items.length);
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <div className="min-h-svh lg:pl-60" lang={locale}>
        <AdminNav groups={groups} user={user.name} accountLabel={t("nav.account")} logoutLabel={t("nav.logout")} menuLabel={t("nav.menu")} logout={logout} />
        <main className={`mx-auto px-4 py-5 sm:py-6 ${wide ? "max-w-[110rem]" : "max-w-6xl"}`}>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <h1 className="font-sans text-xl font-semibold sm:text-2xl">{title}</h1>
            {actions}
          </div>
          {children}
        </main>
      </div>
    </NextIntlClientProvider>
  );
}

export const STATUS_STYLE: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-900",
  CONFIRMED: "bg-sea-100 text-sea-900",
  CHECKED_IN: "bg-emerald-100 text-emerald-900",
  CHECKED_OUT: "bg-ink-100 text-ink-700",
  CANCELLED: "bg-red-50 text-red-800",
  NO_SHOW: "bg-red-100 text-red-900",
  EXPIRED: "bg-ink-100 text-ink-500",
  APPROVED: "bg-sea-100 text-sea-900",
  REJECTED: "bg-red-50 text-red-800",
};

export function StatusChip({ status, label }: { status: string; label?: string }) {
  return <span data-status={status} className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[status] ?? "bg-mist"}`}>{label ?? status.replace("_", " ").toLowerCase()}</span>;
}
