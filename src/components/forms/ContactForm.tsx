"use client";
import { useActionState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CheckCircle2 } from "lucide-react";
import { submitContact, type FormState } from "@/actions/public";

export function ContactForm() {
  const t = useTranslations();
  const locale = useLocale();
  const [state, action, pending] = useActionState<FormState, FormData>(submitContact, { ok: false });
  if (state.ok)
    return (
      <div role="status" className="flex items-start gap-3 rounded-2xl bg-sea-50 p-6 text-sea-900">
        <CheckCircle2 className="mt-0.5 shrink-0 text-sea-700" aria-hidden /> <p>{t("contact.success")}</p>
      </div>
    );
  const v = (k: string) => state.values?.[k] ?? "";
  const err = (k: string) => state.fieldErrors?.[k] && <p className="mt-1 text-sm text-danger">{t(`form.${state.fieldErrors[k] as "required"}`)}</p>;
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2" noValidate>
      <input type="hidden" name="locale" value={locale} />
      <div className="hidden" aria-hidden><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
      <div>
        <label className="label" htmlFor="c-name">{t("contact.name")} *</label>
        <input id="c-name" name="name" required maxLength={100} defaultValue={v("name")} autoComplete="name" className="field" aria-invalid={!!state.fieldErrors?.name} />
        {err("name")}
      </div>
      <div>
        <label className="label" htmlFor="c-email">{t("contact.yourEmail")} *</label>
        <input id="c-email" name="email" type="email" required maxLength={200} defaultValue={v("email")} autoComplete="email" className="field" aria-invalid={!!state.fieldErrors?.email} />
        {err("email")}
      </div>
      <div>
        <label className="label" htmlFor="c-phone">{t("contact.yourPhone")}</label>
        <input id="c-phone" name="phone" type="tel" maxLength={40} defaultValue={v("phone")} autoComplete="tel" className="field" />
        {err("phone")}
      </div>
      <div>
        <label className="label" htmlFor="c-subject">{t("contact.subject")}</label>
        <input id="c-subject" name="subject" maxLength={150} defaultValue={v("subject")} className="field" />
        {err("subject")}
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor="c-message">{t("contact.message")} *</label>
        <textarea id="c-message" name="message" required maxLength={4000} defaultValue={v("message")} rows={5} className="field resize-y" aria-invalid={!!state.fieldErrors?.message} />
        {err("message")}
      </div>
      <label className="flex items-start gap-3 text-sm text-ink-700 sm:col-span-2">
        <input type="checkbox" name="consent" required defaultChecked={v("consent") === "on"} className="mt-1 h-4 w-4 accent-sea-700" />
        <span>{t("contact.consent")}</span>
      </label>
      {err("consent")}
      {state.error && state.error !== "invalid" && <p role="alert" className="text-sm text-danger sm:col-span-2">{t(`form.${state.error}`)}</p>}
      <button type="submit" disabled={pending} className="btn btn-primary sm:col-span-2 sm:justify-self-start">
        {pending ? t("common.sending") : t("common.send")}
      </button>
    </form>
  );
}
