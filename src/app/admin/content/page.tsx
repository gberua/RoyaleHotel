import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { ExternalLink } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/admin-auth";
import { adminT } from "@/lib/admin-i18n";
import { tr } from "@/lib/i18n-content";
import { toIso } from "@/lib/booking/dates";
import { CONTENT_PAGES, FAQ_CATEGORIES } from "@/lib/content/pages";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { ActionButton, AdminForm, Card, LocalizedInput, SelectInput, TextInput, Toggle } from "@/components/admin/ui";
import { SortableList } from "@/components/admin/Sortable";
import { MediaPicker } from "@/components/admin/MediaPicker";
import {
  deleteAttraction, deleteFaq, deleteOffer, deletePolicy, discardPolicyDraft, orderAttractions, orderFaq, orderOffers, orderPolicies,
  publishPolicy, saveAttraction, saveFaq, saveOffer, savePolicyDraft,
} from "./actions";

export const metadata: Metadata = { title: "Website content" };
const TABS = ["pages", "faq", "policies", "offers", "kobuleti"] as const;
type L = Record<string, string>;

async function Content({ searchParams }: { searchParams: PageProps<"/admin/content">["searchParams"] }) {
  await connection();
  const user = await requirePermission("content");
  const t = await adminT(user.adminLocale);
  const loc = user.adminLocale;
  const sp = await searchParams;
  const tab = TABS.find((x) => x === sp.tab) ?? "pages";
  const pill = (on: boolean) => `rounded-full px-2 py-0.5 text-xs font-semibold ${on ? "bg-sea-100 text-sea-800" : "bg-ink-100 text-ink-700"}`;
  const preview = (path: string) => <a href={`/admin/preview?path=${encodeURIComponent(path)}`} target="_blank" rel="noopener" className="btn btn-ghost !min-h-9 !px-3 text-xs"><ExternalLink size={13} aria-hidden /> {t("content.preview")}</a>;

  let body;
  if (tab === "pages") {
    const pages = await db.page.findMany({ select: { key: true, draft: true, publishedAt: true, updatedAt: true } });
    const byKey = new Map(pages.map((p) => [p.key, p]));
    body = (
      <div className="space-y-4">
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {CONTENT_PAGES.map((k) => {
            const p = byKey.get(k);
            return (
              <li key={k}>
                <Link href={`/admin/content/pages/${k}`} className="block rounded-2xl bg-white p-4 ring-1 ring-ink-100 hover:ring-sea-500">
                  <span className="flex items-center justify-between gap-2"><span className="font-semibold">{t(`content.pages.${k}`)}</span>{p?.draft ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">{t("content.draftBadge")}</span> : null}</span>
                  <span className="mt-1 block text-xs text-ink-500">{t(`content.pageHints.${k}`)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
        <p className="text-sm text-ink-700">{t("content.elsewhere")} <Link href="/admin/settings#contact" className="font-semibold text-sea-700 hover:underline">{t("nav.settings")}</Link> · <Link href="/admin/media?tab=home" className="font-semibold text-sea-700 hover:underline">{t("nav.media")}</Link> · <Link href="/admin/rooms" className="font-semibold text-sea-700 hover:underline">{t("nav.rooms")}</Link></p>
      </div>
    );
  } else if (tab === "faq") {
    const faq = await db.faqItem.findMany({ orderBy: [{ sortOrder: "asc" }] });
    const catOptions = FAQ_CATEGORIES.map((c) => ({ value: c, label: t(`content.faqCat.${c}`) }));
    const form = (f?: (typeof faq)[number]) => (
      <AdminForm action={saveFaq} submit={f ? t("common.save") : t("common.add")} resetOnSuccess={!f} tone={f ? "ghost" : "primary"} className="space-y-3">
        {f && <input type="hidden" name="id" value={f.id} />}
        <LocalizedInput label={t("content.question")} name="question" value={f?.question as L} required />
        <LocalizedInput label={t("content.answer")} name="answer" value={f?.answer as L} multiline required />
        <div className="grid items-end gap-3 sm:grid-cols-2"><SelectInput label={t("content.category")} name="category" defaultValue={f?.category ?? "general"} options={catOptions} /><Toggle name="active" label={t("content.published")} defaultChecked={f?.active ?? true} hint={t("content.publishedHint")} /></div>
      </AdminForm>
    );
    body = (
      <div className="space-y-4">
        <Card actions={preview("/faq")}>
          <SortableList action={orderFaq} items={faq.map((f) => ({
            id: f.id,
            node: (
              <details>
                <summary className="flex cursor-pointer flex-wrap items-center gap-2 p-1"><span className="font-semibold">{tr(f.question, loc)}</span><span className={pill(f.active)}>{f.active ? t("content.published") : t("content.draftBadge")}</span><span className="text-xs text-ink-500">{t(`content.faqCat.${f.category}`)}</span></summary>
                <div className="mt-2 space-y-2 border-t border-ink-100 pt-3">{form(f)}<ActionButton action={deleteFaq} fields={{ id: f.id }} label={t("common.delete")} tone="danger" confirm={t("content.deleteConfirm")} /></div>
              </details>
            ),
          }))} />
        </Card>
        <Card title={t("content.addFaq")}>{form()}</Card>
      </div>
    );
  } else if (tab === "policies") {
    const policies = await db.policy.findMany({ orderBy: { sortOrder: "asc" } });
    body = (
      <div className="space-y-4">
        <p className="text-sm text-ink-700">{t("content.policiesHint")}</p>
        <SortableList action={orderPolicies} items={policies.map((p) => {
          const d = p.draft as { title: L; body: L } | null;
          return {
            id: p.slug,
            node: (
              <details>
                <summary className="flex cursor-pointer flex-wrap items-center gap-2 p-1"><span className="font-semibold">{tr(d?.title ?? p.title, loc)}</span>{d && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">{t("content.draftBadge")}</span>}<span className="text-xs text-ink-500">/policies/{p.slug}</span></summary>
                <div className="mt-2 space-y-3 border-t border-ink-100 pt-3">
                  <AdminForm action={savePolicyDraft} submit={t("content.saveDraft")} tone="ghost" className="space-y-3">
                    <input type="hidden" name="slug" value={p.slug} />
                    <LocalizedInput label={t("content.texts.title")} name="title" value={d?.title ?? (p.title as L)} required />
                    <LocalizedInput label={t("content.policyText")} name="body" value={d?.body ?? (p.body as L)} multiline rows={12} required hint={t("content.markdownHint")} />
                  </AdminForm>
                  <div className="flex flex-wrap gap-2">
                    {preview(`/policies/${p.slug}`)}
                    {d && <ActionButton action={publishPolicy} fields={{ slug: p.slug }} label={t("content.publish")} tone="primary" />}
                    {d && <ActionButton action={discardPolicyDraft} fields={{ slug: p.slug }} label={t("content.discard")} confirm={t("content.discardConfirm")} />}
                    <ActionButton action={deletePolicy} fields={{ slug: p.slug }} label={t("common.delete")} tone="danger" confirm={t("content.deleteConfirm")} />
                  </div>
                </div>
              </details>
            ),
          };
        })} />
        <Card title={t("content.addPolicy")}>
          <AdminForm action={savePolicyDraft} submit={t("content.saveDraft")} resetOnSuccess className="space-y-3">
            <LocalizedInput label={t("content.texts.title")} name="title" required />
            <LocalizedInput label={t("content.policyText")} name="body" multiline rows={8} required hint={t("content.markdownHint")} />
          </AdminForm>
        </Card>
      </div>
    );
  } else if (tab === "offers") {
    const offers = await db.offer.findMany({ orderBy: { sortOrder: "asc" } });
    const today = new Date().toISOString().slice(0, 10);
    const form = (o?: (typeof offers)[number]) => (
      <AdminForm action={saveOffer} submit={o ? t("common.save") : t("common.add")} resetOnSuccess={!o} tone={o ? "ghost" : "primary"} className="space-y-3">
        {o && <input type="hidden" name="id" value={o.id} />}
        <div className="grid gap-3 sm:grid-cols-2">
          <LocalizedInput label={t("content.texts.title")} name="title" value={o?.title as L} required />
          <LocalizedInput label={t("content.badge")} name="badge" value={o?.badge as L} hint={t("content.badgeHint")} />
        </div>
        <LocalizedInput label={t("content.summary")} name="summary" value={o?.summary as L} multiline rows={2} required />
        <LocalizedInput label={t("content.details")} name="body" value={o?.body as L} multiline rows={5} hint={t("content.markdownHint")} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <TextInput label={t("content.validFrom")} name="validFrom" type="date" defaultValue={o?.validFrom ? toIso(o.validFrom) : ""} />
          <TextInput label={t("content.validTo")} name="validTo" type="date" defaultValue={o?.validTo ? toIso(o.validTo) : ""} hint={t("content.validToHint")} />
          <TextInput label={t("content.promoCode")} name="promoCode" defaultValue={o?.promoCode} hint={t("content.promoHint")} />
        </div>
        <MediaPicker name="mediaId" value={o?.mediaId} label={t("content.photo")} noneLabel={t("content.noPhoto")} />
        <Toggle name="active" label={t("content.published")} defaultChecked={o?.active ?? false} hint={t("content.publishedHint")} />
      </AdminForm>
    );
    body = (
      <div className="space-y-4">
        <Card actions={preview("/offers")}>
          <SortableList action={orderOffers} items={offers.map((o) => {
            const expired = !!o.validTo && toIso(o.validTo) < today;
            return {
              id: o.id,
              node: (
                <details>
                  <summary className="flex cursor-pointer flex-wrap items-center gap-2 p-1"><span className="font-semibold">{tr(o.title, loc)}</span><span className={pill(o.active && !expired)}>{expired ? t("content.expired") : o.active ? t("content.published") : t("content.draftBadge")}</span>{(o.validFrom || o.validTo) && <span className="text-xs text-ink-500">{o.validFrom ? toIso(o.validFrom) : "…"} → {o.validTo ? toIso(o.validTo) : "…"}</span>}</summary>
                  <div className="mt-2 space-y-2 border-t border-ink-100 pt-3">{form(o)}<ActionButton action={deleteOffer} fields={{ id: o.id }} label={t("common.delete")} tone="danger" confirm={t("content.deleteConfirm")} /></div>
                </details>
              ),
            };
          })} />
        </Card>
        <Card title={t("content.addOffer")}>{form()}</Card>
      </div>
    );
  } else {
    const items = await db.attraction.findMany({ orderBy: { sortOrder: "asc" } });
    const form = (a?: (typeof items)[number]) => (
      <AdminForm action={saveAttraction} submit={a ? t("common.save") : t("common.add")} resetOnSuccess={!a} tone={a ? "ghost" : "primary"} className="space-y-3">
        {a && <input type="hidden" name="id" value={a.id} />}
        <LocalizedInput label={t("content.texts.title")} name="title" value={a?.title as L} required />
        <LocalizedInput label={t("content.summary")} name="summary" value={a?.summary as L} multiline rows={2} required />
        <LocalizedInput label={t("content.details")} name="body" value={a?.body as L} multiline rows={4} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <TextInput label={t("content.distanceKm")} name="distanceKm" defaultValue={a?.distanceKm?.toString()} inputMode="decimal" />
          <TextInput label={t("content.driveMinutes")} name="driveMinutes" defaultValue={a?.driveMinutes} inputMode="numeric" />
          <TextInput label={t("content.mapUrl")} name="mapUrl" type="url" defaultValue={a?.mapUrl} className="col-span-2 sm:col-span-1" />
        </div>
        <MediaPicker name="mediaId" value={a?.mediaId} label={t("content.photo")} noneLabel={t("content.noPhoto")} />
        <Toggle name="active" label={t("content.published")} defaultChecked={a?.active ?? false} hint={t("content.publishedHint")} />
      </AdminForm>
    );
    body = (
      <div className="space-y-4">
        <p className="text-sm text-ink-700">{t("content.kobuletiHint")} <Link href="/admin/content/pages/kobuleti" className="font-semibold text-sea-700 hover:underline">{t("content.pages.kobuleti")}</Link></p>
        <Card actions={preview("/kobuleti")}>
          <SortableList action={orderAttractions} items={items.map((a) => ({
            id: a.id,
            node: (
              <details>
                <summary className="flex cursor-pointer flex-wrap items-center gap-2 p-1"><span className="font-semibold">{tr(a.title, loc)}</span><span className={pill(a.active)}>{a.active ? t("content.published") : t("content.draftBadge")}</span>{a.distanceKm != null && <span className="text-xs text-ink-500">{a.distanceKm.toString()} km</span>}</summary>
                <div className="mt-2 space-y-2 border-t border-ink-100 pt-3">{form(a)}<ActionButton action={deleteAttraction} fields={{ id: a.id }} label={t("common.delete")} tone="danger" confirm={t("content.deleteConfirm")} /></div>
              </details>
            ),
          }))} />
        </Card>
        <Card title={t("content.addPlace")}>{form()}</Card>
      </div>
    );
  }

  return (
    <AdminFrame user={user} title={t("content.title")}>
      <nav className="mb-4 flex gap-1 overflow-x-auto rounded-xl bg-white p-1 ring-1 ring-ink-100" aria-label={t("content.title")}>
        {TABS.map((x) => <Link key={x} href={`/admin/content?tab=${x}`} aria-current={tab === x ? "page" : undefined} className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold ${tab === x ? "bg-ink-900 text-white" : "text-ink-700 hover:bg-mist"}`}>{t(`content.tabs.${x}`)}</Link>)}
      </nav>
      {body}
    </AdminFrame>
  );
}

export default function ContentPage({ searchParams }: PageProps<"/admin/content">) {
  return <Suspense fallback={<p className="p-8 text-ink-500">…</p>}><Content searchParams={searchParams} /></Suspense>;
}
