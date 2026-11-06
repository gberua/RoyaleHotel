"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2, UploadCloud } from "lucide-react";
import { uploadMedia } from "@/app/admin/media/actions";
import { useErrorText } from "./ui";

/** Drag-and-drop (or pick) many photos; each is uploaded and converted to WebP + AVIF one by one. */
export function MediaUploader({ category = "unsorted", roomTypeId, inGallery = false, compact = false }: { category?: string; roomTypeId?: string; inGallery?: boolean; compact?: boolean }) {
  const t = useTranslations("admin.media");
  const errText = useErrorText();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const [report, setReport] = useState<{ ok: number; dup: number; errors: string[] } | null>(null);

  async function send(files: File[]) {
    if (!files.length) return;
    setReport(null);
    const r = { ok: 0, dup: 0, errors: [] as string[] };
    for (let i = 0; i < files.length; i++) {
      setBusy({ done: i, total: files.length });
      const fd = new FormData();
      fd.set("file", files[i]);
      fd.set("category", category);
      if (roomTypeId) fd.set("roomTypeId", roomTypeId);
      if (inGallery) fd.set("inGallery", "true");
      try {
        const res = await uploadMedia({ ok: true }, fd);
        if (res.ok) { if (res.data?.duplicate) r.dup++; else r.ok++; }
        else r.errors.push(`${files[i].name}: ${errText(res.error, res.values)}`);
      } catch {
        r.errors.push(`${files[i].name}: ${errText("file_size", { mb: 24 })}`);
      }
    }
    setBusy(null);
    setReport(r);
    if (input.current) input.current.value = "";
    router.refresh();
  }

  return (
    <div>
      <label
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); if (!busy) void send(Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name))); }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed text-center text-sm transition-colors ${compact ? "p-3" : "p-6"} ${over ? "border-sea-600 bg-sea-50" : "border-ink-100 bg-white hover:border-sea-500"}`}
      >
        {busy ? <Loader2 className="animate-spin text-sea-700" aria-hidden /> : <UploadCloud className="text-sea-700" aria-hidden />}
        <span className="font-semibold text-ink-900">{busy ? t("uploading", { done: busy.done + 1, total: busy.total }) : t("drop")}</span>
        {!compact && <span className="text-xs text-ink-500">{t("dropHint")}</span>}
        <input ref={input} type="file" accept="image/*,.heic,.heif" multiple className="sr-only" disabled={!!busy} onChange={(e) => void send(Array.from(e.target.files ?? []))} data-testid="media-file" />
      </label>
      {report && (
        <div role="status" className="mt-2 text-sm">
          {report.ok > 0 && <p className="text-success">{t("uploaded", { count: report.ok })}</p>}
          {report.dup > 0 && <p className="text-ink-700">{t("duplicates", { count: report.dup })}</p>}
          {report.errors.map((e) => <p key={e} className="text-danger">{e}</p>)}
        </div>
      )}
    </div>
  );
}
