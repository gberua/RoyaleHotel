import type { Metadata } from "next";
import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { connection } from "next/server";
import { ExternalLink } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/admin-auth";
import { adminT, type AdminT } from "@/lib/admin-i18n";
import { settingsSchema } from "@/lib/settings-schema";
import { tr } from "@/lib/i18n-content";
import { MEDIA_CATEGORIES } from "@/lib/media/categories";
import { mediaUsage, type Usage } from "@/lib/admin/media-usage";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { ActionButton, AdminForm, Card, LocalizedInput, SelectInput, Toggle } from "@/components/admin/ui";
import { SortableList } from "@/components/admin/Sortable";
import { MediaUploader } from "@/components/admin/MediaUploader";
import { attachRoomPhoto, deleteMedia, detachRoomPhoto, orderGallery, orderRoomPhotos, replaceMedia, setHomeImage, setRoomCover, updateMedia } from "./actions";

export const metadata: Metadata = { title: "Media library" };

type Row = Awaited<ReturnType<typeof loadMedia>>[number];
const loadMedia = () => db.media.findMany({ orderBy: [{ createdAt: "desc" }] });
const TABS = ["library", "rooms", "gallery", "home"] as const;

function usageText(t: AdminT, u: Usage) {
  if (u.kind === "hero" || u.kind === "heroMobile" || u.kind === "og" || u.kind === "gallery") return t(`media.use.${u.label}`);
  if (u.kind === "page") return `${t("media.use.page")}: ${u.label}`;
  return `${t(`media.use.${u.kind}`)}: ${u.label}`;
}

function Thumb({ m, sizes = "240px" }: { m: Row; sizes?: string }) {
  const alt = (m.alt ?? {}) as Record<string, string>;
  return (
    <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-mist">
      <Image src={m.url} alt={alt.en || alt.ka || ""} fill sizes={sizes} className="object-cover" placeholder={m.blurDataUrl ? "blur" : "empty"} blurDataURL={m.blurDataUrl ?? undefined} draggable={false} />
      {m.isDemo && <span className="absolute left-1.5 top-1.5 rounded bg-amber-300 px-1.5 py-0.5 text-[0.6rem] font-bold uppercase tracking-wide text-amber-950 shadow">DEMO</span>}
    </div>
  );
}

function MediaCard({ m, t, usage, locale }: { m: Row; t: AdminT; usage: Usage[]; locale: string }) {
  const real = usage.filter((u) => u.kind !== "gallery");
  const categoryOptions = MEDIA_CATEGORIES.map((c) => ({ value: c, label: t(`media.cat.${c}`) }));
  const alt = (m.alt ?? {}) as Record<string, string>;
  const missingAlt = !alt.ka || !alt.en || !alt.ru;
  return (
    <li className="overflow-hidden rounded-2xl bg-white ring-1 ring-ink-100" data-testid="media-card">
      <Thumb m={m} sizes="(max-width: 640px) 50vw, 260px" />
      <div className="space-y-1.5 p-3 text-xs text-ink-700">
        {m.isDemo && <p className="font-semibold text-amber-800">{t("media.demoBadge")}</p>}
        <p className="font-medium text-ink-900">{tr(m.alt, locale) || <span className="text-amber-700">{t("media.noAlt")}</span>}</p>
        <p className="truncate font-mono text-[0.66rem] text-ink-500" title={m.sourceFile ?? ""}>{m.sourceFile ?? m.url} · {m.width}×{m.height}</p>
        {m.credit && <p>{m.creditUrl ? <a href={m.creditUrl} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-sea-700 hover:underline">{m.credit} <ExternalLink size={11} aria-hidden /></a> : m.credit}{m.license && <span className="text-ink-500"> · {m.license}</span>}</p>}
        <p className="flex flex-wrap gap-1">
          {usage.length ? usage.map((u, i) => <span key={i} className="rounded bg-sea-50 px-1.5 py-0.5 text-sea-800">{usageText(t, u)}</span>) : <span className="rounded bg-ink-100 px-1.5 py-0.5">{t("media.unused")}</span>}
          {missingAlt && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-800">{t("media.altMissing")}</span>}
        </p>
        <details>
          <summary className="cursor-pointer pt-1 text-sm font-semibold text-sea-700">{t("common.edit")}</summary>
          <div className="mt-2 space-y-3">
            <AdminForm action={updateMedia} submit={t("common.save")} tone="ghost" className="space-y-2">
              <input type="hidden" name="id" value={m.id} />
              <LocalizedInput label={t("media.alt")} name="alt" value={alt} hint={t("media.altHint")} />
              <SelectInput label={t("media.category")} name="category" defaultValue={m.category} options={categoryOptions} />
              <Toggle name="inGallery" label={t("media.inGallery")} defaultChecked={m.inGallery} />
            </AdminForm>
            <AdminForm action={replaceMedia} submit={t("media.replace")} tone="ghost" className="border-t border-ink-100 pt-2">
              <input type="hidden" name="id" value={m.id} />
              <label className="block text-xs font-medium">{t("media.replaceHint")}<input type="file" name="file" accept="image/*,.heic,.heif" className="mt-1 block w-full text-xs" /></label>
            </AdminForm>
            <div className="border-t border-ink-100 pt-2">
              <ActionButton action={deleteMedia} fields={{ id: m.id, force: real.length ? "1" : "0" }} label={t("common.delete")} tone="danger"
                confirm={real.length ? t("media.deleteUsed", { places: real.map((u) => usageText(t, u)).join(", ") }) : t("media.deleteConfirm")} />
            </div>
          </div>
        </details>
      </div>
    </li>
  );
}

async function Library({ searchParams }: { searchParams: PageProps<"/admin/media">["searchParams"] }) {
  await connection();
  const user = await requirePermission("media");
  const t = await adminT(user.adminLocale);
  const L = user.adminLocale;
  const sp = await searchParams;
  const tab = TABS.find((x) => x === sp.tab) ?? "library";
  const demoOnly = sp.demo === "1";
  const unusedOnly = sp.unused === "1";
  const cat = MEDIA_CATEGORIES.find((c) => c === sp.cat);

  const [all, usage, rooms, settingRow] = await Promise.all([
    loadMedia(),
    mediaUsage(L),
    db.roomType.findMany({ orderBy: [{ active: "desc" }, { sortOrder: "asc" }], include: { photos: { orderBy: { sortOrder: "asc" } } } }),
    db.setting.findUnique({ where: { key: "media" } }),
  ]);
  const byId = new Map(all.map((m) => [m.id, m]));
  const demoInUse = all.filter((m) => m.isDemo && usage.has(m.id)).length;
  const inUse = all.filter((m) => usage.has(m.id)).length;
  const qs = (o: Record<string, string | undefined>) => {
    const p = new URLSearchParams(Object.entries({ tab, demo: demoOnly ? "1" : undefined, unused: unusedOnly ? "1" : undefined, cat, ...o }).filter(([, v]) => v) as [string, string][]);
    return `/admin/media?${p}`;
  };
  const chip = (on: boolean) => `rounded-full border px-3 py-1.5 text-sm font-semibold ${on ? "border-ink-900 bg-ink-900 text-white" : "border-ink-100 bg-white text-ink-700"}`;
  const visible = all.filter((m) => (!demoOnly || m.isDemo) && (!unusedOnly || !usage.has(m.id)) && (!cat || m.category === cat));
  const small = "[&_button]:!min-h-8 [&_button]:!px-2 [&_button]:text-xs [&_div]:mt-1";

  let body;
  if (tab === "library") {
    body = (
      <div className="space-y-4">
        <MediaUploader category={cat ?? "unsorted"} />
        <div className="flex flex-wrap items-center gap-2">
          <Link href={qs({ demo: demoOnly ? undefined : "1" })} role="switch" aria-checked={demoOnly} className={demoOnly ? "rounded-full border border-amber-500 bg-amber-100 px-3 py-1.5 text-sm font-semibold text-amber-950" : chip(false)}>{t("media.demoOnly")}</Link>
          <Link href={qs({ unused: unusedOnly ? undefined : "1" })} className={chip(unusedOnly)}>{t("media.unusedOnly")}</Link>
          <span className="mx-1 h-5 w-px bg-ink-100" />
          <Link href={qs({ cat: undefined })} className={chip(!cat)}>{t("common.all")}</Link>
          {MEDIA_CATEGORIES.map((c) => <Link key={c} href={qs({ cat: c })} className={chip(cat === c)}>{t(`media.cat.${c}`)}</Link>)}
        </div>
        <p className="text-xs text-ink-500">{t("media.count", { count: visible.length })}</p>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
          {visible.map((m) => <MediaCard key={m.id} m={m} t={t} usage={usage.get(m.id) ?? []} locale={L} />)}
        </ul>
      </div>
    );
  } else if (tab === "rooms") {
    body = (
      <div className="space-y-5">
        {rooms.map((rt) => {
          const linked = new Set(rt.photos.map((p) => p.mediaId));
          return (
            <Card key={rt.id} title={`${tr(rt.name, L)}${rt.active ? "" : ` (${t("rooms.archivedTag")})`}`}>
              {rt.photos.length === 0 && <p className="mb-2 text-sm text-amber-800">{t("media.noRoomPhotos")}</p>}
              <SortableList action={orderRoomPhotos} extra={{ roomTypeId: rt.id }} layout="grid" items={rt.photos.filter((p) => byId.has(p.mediaId)).map((p, i) => ({
                id: p.mediaId,
                node: (
                  <div className="space-y-1">
                    <Thumb m={byId.get(p.mediaId)!} sizes="200px" />
                    {i === 0 ? <p className="py-1 text-xs font-semibold text-sea-800">★ {t("media.cover")}</p> : <ActionButton action={setRoomCover} fields={{ roomTypeId: rt.id, mediaId: p.mediaId }} label={t("media.setCover")} className={small} />}
                    <ActionButton action={detachRoomPhoto} fields={{ roomTypeId: rt.id, mediaId: p.mediaId }} label={t("media.removeFromRoom")} className={small} />
                  </div>
                ),
              }))} />
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <MediaUploader category="room" roomTypeId={rt.id} compact />
                <details className="rounded-2xl p-3 ring-1 ring-ink-100">
                  <summary className="cursor-pointer text-sm font-semibold text-sea-700">{t("media.fromLibrary")}</summary>
                  <ul className="mt-2 grid max-h-80 grid-cols-3 gap-2 overflow-y-auto">
                    {all.filter((m) => !linked.has(m.id)).sort((a, b) => Number(b.category === "room") - Number(a.category === "room")).map((m) => (
                      <li key={m.id}>
                        <AdminForm action={attachRoomPhoto}>
                          <input type="hidden" name="roomTypeId" value={rt.id} /><input type="hidden" name="mediaId" value={m.id} />
                          <button className="block w-full rounded-lg ring-sea-600 hover:ring-2" aria-label={`${t("common.add")}: ${tr(m.alt, L) || m.sourceFile}`}><Thumb m={m} sizes="120px" /></button>
                        </AdminForm>
                      </li>
                    ))}
                  </ul>
                </details>
              </div>
            </Card>
          );
        })}
      </div>
    );
  } else if (tab === "gallery") {
    const gallery = all.filter((m) => m.inGallery).sort((a, b) => a.galleryOrder - b.galleryOrder);
    body = (
      <div className="space-y-5">
        <p className="text-sm text-ink-700">{t("media.galleryHint")}</p>
        <MediaUploader inGallery />
        {MEDIA_CATEGORIES.map((c) => {
          const list = gallery.filter((m) => m.category === c);
          if (!list.length) return null;
          return (
            <Card key={c} title={`${t(`media.cat.${c}`)} · ${list.length}`}>
              <SortableList action={orderGallery} layout="grid" items={list.map((m) => ({ id: m.id, node: <Thumb m={m} sizes="200px" /> }))} />
            </Card>
          );
        })}
      </div>
    );
  } else {
    const s = settingsSchema.shape.media.parse(settingRow?.value ?? {});
    const slots = [
      { slot: "hero", id: s.heroImageIds[0] },
      { slot: "heroMobile", id: s.heroMobileImageId },
      { slot: "cta", id: s.heroImageIds[1] },
      { slot: "og", id: s.ogImageId },
    ];
    body = (
      <div className="grid gap-4 md:grid-cols-2">
        {slots.map((sl) => {
          const cur = sl.id ? byId.get(sl.id) : undefined;
          return (
            <Card key={sl.slot} title={t(`media.slot.${sl.slot}`)}>
              <p className="mb-2 text-xs text-ink-500">{t(`media.slot.${sl.slot}Hint`)}</p>
              {cur ? <Thumb m={cur} sizes="400px" /> : <p className="rounded-lg bg-mist p-6 text-center text-sm text-ink-500">{t("media.noneChosen")}</p>}
              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-semibold text-sea-700">{t("media.choose")}</summary>
                <AdminForm action={setHomeImage} submit={t("common.save")} className="mt-2">
                  <input type="hidden" name="slot" value={sl.slot} />
                  <div className="grid max-h-80 grid-cols-3 gap-2 overflow-y-auto">
                    {all.map((m) => (
                      <label key={m.id} className="block cursor-pointer rounded-lg has-[:checked]:ring-2 has-[:checked]:ring-sea-600">
                        <input type="radio" name="mediaId" value={m.id} defaultChecked={m.id === sl.id} className="sr-only" />
                        <Thumb m={m} sizes="120px" />
                      </label>
                    ))}
                  </div>
                </AdminForm>
              </details>
            </Card>
          );
        })}
      </div>
    );
  }

  return (
    <AdminFrame user={user} title={t("media.title")} wide>
      <p className="mb-3 text-sm text-ink-700">{t("media.summary", { demo: demoInUse, used: inUse, total: all.length })}</p>
      <nav className="mb-4 flex gap-1 overflow-x-auto rounded-xl bg-white p-1 ring-1 ring-ink-100" aria-label={t("media.title")}>
        {TABS.map((x) => <Link key={x} href={`/admin/media?tab=${x}`} aria-current={tab === x ? "page" : undefined} className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold ${tab === x ? "bg-ink-900 text-white" : "text-ink-700 hover:bg-mist"}`}>{t(`media.tabs.${x}`)}</Link>)}
      </nav>
      {body}
    </AdminFrame>
  );
}

export default function MediaPage({ searchParams }: PageProps<"/admin/media">) {
  return <Suspense fallback={<p className="p-8 text-ink-500">…</p>}><Library searchParams={searchParams} /></Suspense>;
}
