import { getTranslations } from "next-intl/server";
import { Quote } from "lucide-react";
import { Stars } from "@/components/ui/Stars";
import { BrandIcon } from "@/components/ui/BrandIcon";

type Review = { id: string; source: string; authorName: string; country: string | null; rating: number; title: string | null; body: string; reply: string | null; date: string };

export async function ReviewCard({ review }: { review: Review }) {
  const t = await getTranslations("reviews");
  return (
    <article className="flex h-full flex-col rounded-[var(--radius-card)] bg-white p-6 shadow-[var(--shadow-soft)] ring-1 ring-ink-100/60 sm:p-7">
      <div className="flex items-center justify-between">
        <Stars value={review.rating} size={15} />
        <span className="flex items-center gap-1.5 text-xs font-semibold text-ink-500">
          {review.source === "GOOGLE" && <BrandIcon name="google" className="h-3.5 w-3.5" />}
          {t(`source.${review.source as "GOOGLE"}`)}
        </span>
      </div>
      <Quote size={22} className="mt-5 text-sea-300" aria-hidden />
      {review.title && <h3 className="mt-2 font-sans text-base font-semibold text-ink-900">{review.title}</h3>}
      <p className="mt-2 flex-1 text-[0.95rem] leading-relaxed text-ink-700">{review.body}</p>
      {review.reply && (
        <div className="mt-4 rounded-xl bg-mist p-3 text-sm text-ink-700">
          <p className="mb-1 text-xs font-semibold text-sea-800">{t("hotelReply")}</p>
          {review.reply}
        </div>
      )}
      <p className="mt-5 text-sm font-semibold text-ink-900">
        {review.authorName}
        {review.country && <span className="font-normal text-ink-500"> · {review.country}</span>}
      </p>
    </article>
  );
}
