import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/admin-auth";
import { adminT } from "@/lib/admin-i18n";
import { toIso } from "@/lib/booking/dates";
import { REVIEW_SOURCES, REVIEW_STATUSES, type ReviewStatusName } from "@/lib/reviews";
import { AdminFrame, StatusChip } from "@/components/admin/AdminFrame";
import { ActionButton, AdminForm, Card, Field, SelectInput, TextInput, Toggle } from "@/components/admin/ui";
import { Stars } from "@/components/ui/Stars";
import { deleteReview, saveReview, setReviewFeatured, setReviewStatus } from "./actions";

export const metadata: Metadata = { title: "Reviews" };
const area = "field resize-y text-sm";

async function Reviews({ searchParams }: { searchParams: PageProps<"/admin/reviews">["searchParams"] }) {
  await connection();
  const user = await requirePermission("reviews");
  const t = await adminT(user.adminLocale);
  const sp = await searchParams;
  const filter = (REVIEW_STATUSES as readonly string[]).includes(String(sp.status)) ? (sp.status as ReviewStatusName) : null;
  const [rows, counts] = await Promise.all([
    db.review.findMany({
      where: filter ? { status: filter } : {},
      // waiting first, then what the website shows first
      orderBy: [{ status: "asc" }, { featured: "desc" }, { publishedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      take: 300,
    }),
    db.review.groupBy({ by: ["status"], _count: true }),
  ]);
  const countOf = (s: string) => counts.find((c) => c.status === s)?._count ?? 0;
  const total = counts.reduce((n, c) => n + c._count, 0);

  const form = (r?: (typeof rows)[number]) => (
    <AdminForm action={saveReview} submit={r ? t("common.save") : t("common.add")} resetOnSuccess={!r} tone={r ? "ghost" : "primary"} className="space-y-3">
      {r && <input type="hidden" name="id" value={r.id} />}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <TextInput label={t("rv.author")} name="authorName" defaultValue={r?.authorName} required />
        <TextInput label={t("rv.country")} name="country" defaultValue={r?.country} />
        <SelectInput label={t("rv.rating")} name="rating" defaultValue={String(r?.rating ?? 5)} options={[5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: "★".repeat(n) }))} />
        <TextInput label={t("rv.date")} name="publishedAt" type="date" defaultValue={r?.publishedAt ? toIso(r.publishedAt) : ""} />
        <SelectInput label={t("rv.sourceLabel")} name="source" defaultValue={r?.source ?? "GOOGLE"} options={REVIEW_SOURCES.map((s) => ({ value: s, label: t(`rv.source.${s}`) }))} />
        <SelectInput label={t("rv.statusLabel")} name="status" defaultValue={r?.status ?? "APPROVED"} options={REVIEW_STATUSES.map((s) => ({ value: s, label: t(`rv.status.${s}`) }))} />
        <SelectInput label={t("rv.language")} name="locale" defaultValue={r?.locale ?? ""} options={[{ value: "", label: "—" }, { value: "ka", label: "ქართული" }, { value: "en", label: "English" }, { value: "ru", label: "Русский" }]} />
        <TextInput label={t("rv.reviewTitle")} name="title" defaultValue={r?.title} />
      </div>
      <Field label={`${t("rv.body")} *`} name="body"><textarea name="body" rows={4} defaultValue={r?.body ?? ""} className={area} /></Field>
      <Field label={t("rv.reply")} name="reply"><textarea name="reply" rows={2} defaultValue={r?.reply ?? ""} className={area} /></Field>
      <Toggle name="featured" label={t("rv.featured")} hint={t("rv.featuredHint")} defaultChecked={r?.featured ?? false} />
    </AdminForm>
  );

  const tab = (s: ReviewStatusName | null, n: number) => (
    <Link key={s ?? "all"} href={s ? `/admin/reviews?status=${s}` : "/admin/reviews"} aria-current={filter === s ? "page" : undefined}
      className={`rounded-full px-3 py-1 text-sm font-semibold ring-1 ${filter === s ? "bg-ink-900 text-white ring-ink-900" : "bg-white text-ink-700 ring-ink-100 hover:ring-ink-300"}`}>
      {t(`rv.tabs.${s ?? "all"}`)} <span className="font-normal opacity-70">{n}</span>
    </Link>
  );

  return (
    <AdminFrame user={user} title={t("rv.title")}>
      <p className="mb-4 max-w-3xl text-sm text-ink-700">{t("rv.hint")}</p>
      <nav className="mb-5 flex flex-wrap gap-2">{tab(null, total)}{REVIEW_STATUSES.map((s) => tab(s, countOf(s)))}</nav>
      <div className="space-y-4">
        {rows.length === 0 && <p className="rounded-2xl bg-white p-6 text-sm text-ink-500 ring-1 ring-ink-100">{t("rv.empty")}</p>}
        {rows.map((r) => (
          <Card key={r.id} title={r.country ? `${r.authorName} · ${r.country}` : r.authorName} actions={
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {r.featured && <span className="rounded-full bg-star/15 px-2.5 py-0.5 font-semibold text-ink-900">★ {t("rv.featured")}</span>}
              <span className="font-semibold text-ink-500">{t(`rv.source.${r.source}`)}</span>
              <StatusChip status={r.status} label={t(`rv.status.${r.status}`)} />
            </div>
          }>
            <div data-testid="review" data-status={r.status}>
              <div className="flex items-center gap-3 text-xs text-ink-500">
                <Stars value={r.rating} size={14} />
                <span>{toIso(r.publishedAt ?? r.createdAt)}</span>
                {r.locale && <span className="uppercase">{r.locale}</span>}
              </div>
              {r.title && <p className="mt-2 font-semibold">{r.title}</p>}
              <p className="mt-2 max-w-3xl whitespace-pre-line text-sm text-ink-900">{r.body}</p>
              {r.reply && (
                <div className="mt-3 max-w-3xl rounded-xl bg-mist p-3 text-sm text-ink-700">
                  <p className="mb-1 text-xs font-semibold text-sea-800">{t("rv.replyLabel")}</p>
                  {r.reply}
                </div>
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-2 border-t border-ink-100 pt-3">
              {r.status !== "APPROVED" && <ActionButton action={setReviewStatus} fields={{ id: r.id, status: "APPROVED" }} label={t("rv.approve")} tone="primary" />}
              {r.status !== "REJECTED" && <ActionButton action={setReviewStatus} fields={{ id: r.id, status: "REJECTED" }} label={t("rv.reject")} />}
              {r.status === "APPROVED" && <ActionButton action={setReviewFeatured} fields={{ id: r.id, featured: String(!r.featured) }} label={r.featured ? t("rv.unfeature") : t("rv.feature")} />}
              <ActionButton action={deleteReview} fields={{ id: r.id }} label={t("common.delete")} tone="danger" confirm={t("rv.deleteConfirm")} />
            </div>
            <details className="mt-3"><summary className="cursor-pointer text-sm font-semibold text-sea-700">{t("rv.editReply")}</summary><div className="mt-3">{form(r)}</div></details>
          </Card>
        ))}
        <Card title={t("rv.add")}>
          <p className="mb-3 text-sm text-ink-500">{t("rv.addHint")}</p>
          {form()}
        </Card>
      </div>
    </AdminFrame>
  );
}

export default function ReviewsAdminPage({ searchParams }: PageProps<"/admin/reviews">) {
  return <Suspense fallback={<p className="p-8 text-ink-500">…</p>}><Reviews searchParams={searchParams} /></Suspense>;
}
