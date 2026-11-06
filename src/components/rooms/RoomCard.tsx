import { getTranslations } from "next-intl/server";
import { BedDouble, Maximize2, Users } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { RoomTypeView } from "@/lib/data";
import { tr } from "@/lib/i18n-content";
import { Picture } from "@/components/ui/Picture";
import { Price } from "@/components/layout/CurrencyProvider";
import { BookButton } from "@/components/booking/BookButton";

export async function RoomCard({ room, fromPrice, locale, priority = false, sizes, headingLevel = 3 }: { room: RoomTypeView; fromPrice: number; locale: string; priority?: boolean; sizes?: string; headingLevel?: 2 | 3 }) {
  const H = headingLevel === 2 ? "h2" : "h3";
  const t = await getTranslations({ locale });
  const name = tr(room.name, locale);
  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-[var(--radius-card)] bg-white shadow-[var(--shadow-soft)] ring-1 ring-ink-100/60 transition-shadow duration-500 hover:shadow-[var(--shadow-lift)]">
      <div className="relative aspect-[4/3] overflow-hidden">
        <Picture
          image={room.photos[0]}
          locale={locale}
          alt={name}
          fill
          fetchPriority={priority ? "high" : "auto"} loading={priority ? "eager" : "lazy"}
          sizes={sizes ?? "(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 88vw"}
          className="object-cover transition-transform duration-[1.2s] ease-[var(--ease-out-soft)] group-hover:scale-105"
        />
        {room.view === "sea" && (
          <span className="absolute left-4 top-4 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-sea-800 backdrop-blur">
            {t("rooms.view.sea")}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-5 sm:p-6">
        <H className="text-[1.75rem] leading-[1.02] text-ink-900">
          <Link href={`/rooms/${room.slug}`} className="after:absolute after:inset-0">{name}</Link>
        </H>
        <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-ink-500">{tr(room.shortDescription, locale)}</p>
        <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-[0.82rem] text-ink-700">
          {room.sizeM2 && <li className="flex items-center gap-1.5"><Maximize2 size={14} className="text-sea-700" aria-hidden />{t("rooms.size", { value: room.sizeM2 })}</li>}
          <li className="flex items-center gap-1.5"><Users size={14} className="text-sea-700" aria-hidden />{t("rooms.maxGuests")}: {room.maxOccupancy}</li>
          <li className="flex items-center gap-1.5"><BedDouble size={14} className="text-sea-700" aria-hidden />{tr(room.beds, locale)}</li>
        </ul>
        <div className="mt-auto flex items-end justify-between gap-3 pt-5">
          <p className="text-ink-500">
            <span className="text-xs">{locale === "ka" ? "" : `${t("common.from")} `}</span>
            <Price amount={fromPrice} className="font-display text-[1.9rem] leading-none text-ink-900" />
            {locale === "ka" && <span className="text-xs">-{t("common.from")}</span>}
            <span className="text-xs"> {t("common.perNight")}</span>
          </p>
          <BookButton room={room.slug} ariaLabel={`${t("common.bookNow")}: ${name}`} className="btn btn-accent relative z-10 !min-h-10 shrink-0 !px-5 text-sm">
            {t("nav.book")}
          </BookButton>
        </div>
      </div>
    </article>
  );
}
