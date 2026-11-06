"use client";
import { useActionState, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CheckCircle2, Star } from "lucide-react";
import { submitReview, type FormState } from "@/actions/public";

export function ReviewForm() {
  const t = useTranslations();
  const locale = useLocale();
  const [rating, setRating] = useState(0);
  const [state, action, pending] = useActionState<FormState, FormData>(submitReview, { ok: false });
  if (state.ok)
    return (
      <div role="status" className="flex items-start gap-3 rounded-2xl bg-sea-50 p-6 text-sea-900">
        <CheckCircle2 className="mt-0.5 shrink-0 text-sea-700" aria-hidden /> <p>{t("reviews.thanks")}</p>
      </div>
    );
  const err = (k: string) => state.fieldErrors?.[k] && <p className="mt-1 text-sm text-danger">{t(`form.${state.fieldErrors[k] as "required"}`)}</p>;
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2" noValidate>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="rating" value={rating || ""} />
      <div className="hidden" aria-hidden><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
      <fieldset className="sm:col-span-2">
        <legend className="label">{t("reviews.rating")} *</legend>
        <div className="flex gap-1" role="radiogroup">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={t("reviews.ratingStars", { count: n })} onClick={() => setRating(n)} className="p-1">
              <Star size={30} strokeWidth={1.5} className={n <= rating ? "text-star" : "text-ink-300"} fill={n <= rating ? "currentColor" : "none"} />
            </button>
          ))}
        </div>
        {err("rating")}
      </fieldset>
      <div>
        <label className="label" htmlFor="r-name">{t("reviews.yourName")} *</label>
        <input id="r-name" name="authorName" required autoComplete="given-name" className="field" />
        {err("authorName")}
      </div>
      <div>
        <label className="label" htmlFor="r-country">{t("reviews.country")}</label>
        <input id="r-country" name="country" autoComplete="country-name" className="field" />
      </div>
      <div>
        <label className="label" htmlFor="r-month">{t("reviews.stayMonth")}</label>
        <input id="r-month" name="stayMonth" type="month" className="field" />
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor="r-body">{t("reviews.yourReview")} *</label>
        <textarea id="r-body" name="body" required rows={5} className="field resize-y" />
        {err("body")}
      </div>
      {state.error && state.error !== "invalid" && <p role="alert" className="text-sm text-danger sm:col-span-2">{t(`form.${state.error}`)}</p>}
      <button type="submit" disabled={pending} className="btn btn-primary sm:col-span-2 sm:justify-self-start">
        {pending ? t("common.sending") : t("reviews.submit")}
      </button>
    </form>
  );
}
