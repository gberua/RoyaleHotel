"use client";
import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Expand } from "lucide-react";
import type { Slide } from "./Lightbox";

const PhotoLightbox = dynamic(() => import("./Lightbox"), { ssr: false });

export type GridPhoto = Slide & { id: string; blur: string | null; category: string };

/** Categorised, masonry-style gallery with a fast lazy-loaded lightbox. */
export function PhotoGrid({ photos, categories }: { photos: GridPhoto[]; categories: string[] }) {
  const t = useTranslations();
  const [cat, setCat] = useState("all");
  const [open, setOpen] = useState<number | null>(null);
  const visible = useMemo(() => (cat === "all" ? photos : photos.filter((p) => p.category === cat)), [cat, photos]);

  return (
    <>
      {categories.length > 1 && (
        <div className="no-scrollbar -mx-4 mb-8 flex gap-2 overflow-x-auto px-4" role="tablist">
          {["all", ...categories].map((c) => (
            <button
              key={c}
              role="tab"
              aria-selected={cat === c}
              onClick={() => setCat(c)}
              className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${cat === c ? "border-sea-700 bg-sea-700 text-white" : "border-ink-100 text-ink-700 hover:border-sea-500"}`}
            >
              {c === "all" ? t("gallery.all") : t(`gallery.categories.${c as "room"}`)}
            </button>
          ))}
        </div>
      )}
      <ul className="columns-2 gap-3 sm:gap-4 lg:columns-3">
        {visible.map((p, i) => (
          <li key={p.id} className="mb-3 break-inside-avoid sm:mb-4">
            <button type="button" onClick={() => setOpen(i)} className="group relative block w-full overflow-hidden rounded-2xl" aria-label={`${t("common.openGallery")}: ${p.alt}`}>
              <Image
                src={p.src}
                alt={p.alt}
                width={p.width}
                height={p.height}
                placeholder={p.blur ? "blur" : "empty"}
                blurDataURL={p.blur ?? undefined}
                sizes="(min-width:1024px) 33vw, 50vw"
                className="h-auto w-full transition-transform duration-700 group-hover:scale-[1.04]"
              />
              <span className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-white/90 text-ink-900 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden>
                <Expand size={16} />
              </span>
            </button>
          </li>
        ))}
      </ul>
      {open !== null && <PhotoLightbox slides={visible} index={open} onClose={() => setOpen(null)} />}
    </>
  );
}

/** Room page mosaic: one large + two small photos and a "see all" button. */
export function PhotoMosaic({ photos }: { photos: GridPhoto[] }) {
  const t = useTranslations("common");
  const [open, setOpen] = useState<number | null>(null);
  if (!photos.length) return null;
  const shown = photos.slice(0, 3);
  return (
    <>
      <div className="grid h-[52svh] min-h-[20rem] grid-cols-4 grid-rows-2 gap-2 overflow-hidden rounded-[var(--radius-card)] sm:gap-3 lg:h-[64svh]">
        {shown.map((p, i) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setOpen(i)}
            className={`group relative overflow-hidden ${i === 0 ? "col-span-4 row-span-2 sm:col-span-3" : "hidden sm:col-span-1 sm:row-span-1 sm:block"}`}
            aria-label={`${t("openGallery")}: ${p.alt}`}
          >
            <Image src={p.src} alt={p.alt} fill fetchPriority={i === 0 ? "high" : "auto"} loading={i === 0 ? "eager" : "lazy"} placeholder={p.blur ? "blur" : "empty"} blurDataURL={p.blur ?? undefined} sizes={i === 0 ? "(min-width:640px) 75vw, 100vw" : "25vw"} className="object-cover transition-transform duration-700 group-hover:scale-[1.03]" />
          </button>
        ))}
      </div>
      <button type="button" onClick={() => setOpen(0)} className="btn btn-ghost mt-4 !min-h-10 text-sm">
        <Expand size={16} aria-hidden /> {t("seeAllPhotos")} · {t("photos", { count: photos.length })}
      </button>
      {open !== null && <PhotoLightbox slides={photos} index={open} onClose={() => setOpen(null)} />}
    </>
  );
}
