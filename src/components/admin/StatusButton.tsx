"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AlertTriangle, Loader2 } from "lucide-react";
import { adminChangeStatus } from "@/app/admin/booking-actions";
import { useErrorText } from "./ui";

/**
 * Check-in / check-out / confirm / no-show button. A check-in into a room that isn't clean asks for a second,
 * explicit "check in anyway" instead of silently going through.
 */
export function StatusButton({ code, to, label, tone = "primary", confirmText, small = false }: { code: string; to: "CONFIRMED" | "CHECKED_IN" | "CHECKED_OUT" | "NO_SHOW"; label: string; tone?: "primary" | "ghost"; confirmText?: string; small?: boolean }) {
  const t = useTranslations("admin");
  const errText = useErrorText();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [warn, setWarn] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const send = (force: boolean) => start(async () => {
    setErr(null);
    const fd = new FormData(); fd.set("code", code); fd.set("to", to); if (force) fd.set("force", "1");
    const r = await adminChangeStatus({ ok: true }, fd);
    if (!r.ok && r.error === "room_not_clean") { setWarn(errText(r.error, r.values)); return; }
    setWarn(null);
    if (!r.ok) setErr(errText(r.error, r.values)); else router.refresh();
  });
  const cls = `${tone === "primary" ? "btn btn-primary" : "btn btn-ghost"} ${small ? "!min-h-9 !px-3 text-xs" : "!min-h-10 text-sm"}`;
  return (
    <div className="inline-flex flex-col gap-1.5">
      <button type="button" className={cls} disabled={pending} onClick={() => { if (confirmText && !window.confirm(confirmText)) return; send(false); }}>{pending && <Loader2 size={14} className="animate-spin" />}{label}</button>
      {warn && (
        <div role="alert" className="max-w-xs rounded-xl bg-amber-50 p-2.5 text-xs text-amber-950 ring-1 ring-amber-200">
          <p className="flex gap-1.5"><AlertTriangle size={14} className="shrink-0" aria-hidden />{warn}</p>
          <div className="mt-2 flex gap-2">
            <button type="button" className="btn !min-h-8 !px-3 bg-amber-600 text-xs text-white" onClick={() => send(true)} disabled={pending}>{t("bk.checkInAnyway")}</button>
            <button type="button" className="btn btn-ghost !min-h-8 !px-3 text-xs" onClick={() => setWarn(null)}>{t("common.cancel")}</button>
          </div>
        </div>
      )}
      {err && <p role="alert" className="text-xs text-danger">{err}</p>}
    </div>
  );
}
