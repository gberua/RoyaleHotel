"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy } from "lucide-react";

export function CopyCode({ code }: { code: string }) {
  const t = useTranslations("offers");
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => navigator.clipboard?.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); })}
      className="inline-flex items-center gap-2 rounded-xl border border-dashed border-sea-500 bg-sea-50 px-3 py-2 font-mono text-sm font-semibold text-sea-900"
    >
      {code} {copied ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />}
      <span className="sr-only">{copied ? t("copied") : t("copy")}</span>
    </button>
  );
}
