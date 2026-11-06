import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/admin-auth";
import { adminT } from "@/lib/admin-i18n";
import { CONTENT_PAGES, PAGE_PATH, type ContentPage } from "@/lib/content/pages";
import { HOME_SECTIONS, HOME_TEXTS, LONG_TEXTS, homeLayout } from "@/lib/content/home";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { AdminForm, Card, LocalizedInput } from "@/components/admin/ui";
import { SectionOrder } from "@/components/admin/SectionOrder";
import { discardPageDraft, publishPage, savePageDraft } from "../../actions";

export const metadata: Metadata = { title: "Edit page" };
type L = Record<string, string>;

async function Editor({ params }: { params: PageProps<"/admin/content/pages/[key]">["params"] }) {
  await connection();
  const user = await requirePermission("content");
  const t = await adminT(user.adminLocale);
  const { key: raw } = await params;
  if (!(CONTENT_PAGES as readonly string[]).includes(raw)) notFound();
  const key = raw as ContentPage;
  const page = await db.page.findUnique({ where: { key } });
  const draft = page?.draft as { sections: Record<string, unknown>; seoTitle: L; seoDescription: L } | null;
  const src = draft ?? { sections: (page?.sections ?? {}) as Record<string, unknown>, seoTitle: (page?.seoTitle ?? {}) as L, seoDescription: (page?.seoDescription ?? {}) as L };
  const s = src.sections;
  const text = (k: string) => (s[k] ?? {}) as L;
  const layout = homeLayout(s as { order?: string[]; hidden?: string[] });
  const previewPath = (lang: string) => `/admin/preview?path=${encodeURIComponent(`${lang === "ka" ? "" : `/${lang}`}${PAGE_PATH[key]}` || "/")}`;
  const builtIn = (k: string | null) => (k ? t("content.builtIn") : undefined);

  return (
    <AdminFrame user={user} title={`${t("content.title")} › ${t(`content.pages.${key}`)}`} actions={<Link href="/admin/content" className="btn btn-ghost !min-h-10 text-sm"><ArrowLeft size={15} aria-hidden /> {t("common.back")}</Link>}>
      <div className={`mb-4 flex flex-wrap items-center gap-3 rounded-2xl p-4 text-sm ring-1 ${draft ? "bg-amber-50 ring-amber-200" : "bg-white ring-ink-100"}`}>
        <span className="font-semibold">{draft ? t("content.hasDraft") : t("content.noDraft")}</span>
        {page?.publishedAt && <span className="text-ink-500">{t("content.lastPublished")}: {page.publishedAt.toISOString().slice(0, 16).replace("T", " ")}</span>}
        <span className="flex flex-wrap gap-2">
          {["ka", "en", "ru"].map((l) => <a key={l} href={previewPath(l)} target="_blank" rel="noopener" className="btn btn-ghost !min-h-9 !px-3 text-xs"><ExternalLink size={13} aria-hidden /> {t("content.preview")} {l.toUpperCase()}</a>)}
        </span>
        {draft && (
          <span className="ml-auto flex flex-wrap gap-2">
            <AdminForm action={discardPageDraft} submit={t("content.discard")} tone="ghost" confirm={t("content.discardConfirm")}><input type="hidden" name="key" value={key} /></AdminForm>
            <AdminForm action={publishPage} submit={t("content.publish")}><input type="hidden" name="key" value={key} /></AdminForm>
          </span>
        )}
      </div>

      <AdminForm action={savePageDraft} submit={t("content.saveDraft")} className="space-y-4">
        <input type="hidden" name="key" value={key} />
        {key === "home" ? (
          <>
            <Card title={t("content.layout")}>
              <p className="-mt-2 mb-3 text-xs text-ink-500">{t("content.layoutHint")}</p>
              <SectionOrder sections={HOME_SECTIONS.map((id) => ({ id, label: t(`content.sections.${id}`) }))} order={layout.order} hidden={[...layout.hidden]} />
            </Card>
            {(["hero", ...layout.order] as const).filter((id) => Object.keys(HOME_TEXTS[id]).length).map((id) => (
              <Card key={id} title={t(`content.sections.${id}`)}>
                <div className="grid gap-3 sm:grid-cols-2">
                  {Object.entries(HOME_TEXTS[id]).map(([k, fallback]) => (
                    <div key={k} className={LONG_TEXTS.has(k) ? "sm:col-span-2" : ""}>
                      <LocalizedInput label={t(`content.texts.${k}`)} name={k} value={text(k)} multiline={LONG_TEXTS.has(k)} hint={builtIn(fallback)} />
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </>
        ) : key === "footer" ? (
          <Card title={t("content.texts.tagline")}><LocalizedInput label={t("content.texts.tagline")} name="tagline" value={text("tagline")} multiline hint={t("content.builtIn")} /></Card>
        ) : (
          <Card title={t("content.header")}>
            <div className="grid gap-3">
              <LocalizedInput label={t("content.texts.title")} name="title" value={text("title")} hint={t("content.builtIn")} />
              <LocalizedInput label={t("content.texts.intro")} name="intro" value={text("intro")} multiline hint={t("content.builtIn")} />
            </div>
          </Card>
        )}
        {key !== "footer" && (
          <Card title={t("content.seo")}>
            <p className="-mt-2 mb-3 text-xs text-ink-500">{t("content.seoHint")}</p>
            <div className="grid gap-3">
              <LocalizedInput label={t("content.seoTitle")} name="seoTitle" value={src.seoTitle} hint={t("content.seoTitleHint")} />
              <LocalizedInput label={t("content.seoDescription")} name="seoDescription" value={src.seoDescription} multiline rows={2} hint={t("content.seoDescriptionHint")} />
            </div>
          </Card>
        )}
      </AdminForm>
    </AdminFrame>
  );
}

export default function PageEditor({ params }: PageProps<"/admin/content/pages/[key]">) {
  return <Suspense fallback={<p className="p-8 text-ink-500">…</p>}><Editor params={params} /></Suspense>;
}
