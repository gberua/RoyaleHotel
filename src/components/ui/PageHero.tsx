import type { Img } from "@/lib/data";
import { Picture } from "./Picture";

/** Inner-page header: short photo band with title (or plain when no image). */
export function PageHero({ title, intro, eyebrow, image, locale }: { title: string; intro?: string; eyebrow?: string; image?: Img | null; locale: string }) {
  if (!image)
    return (
      <header className="bg-mist pb-12 pt-[calc(var(--header-h)+3rem)] sm:pb-16">
        <div className="container-x">
          <div className="max-w-3xl">
            {eyebrow && <p className="eyebrow mb-3">{eyebrow}</p>}
            <h1 className="text-5xl leading-[1.05] sm:text-6xl">{title}</h1>
            {intro && <p className="mt-4 text-lg text-ink-500">{intro}</p>}
          </div>
        </div>
      </header>
    );
  return (
    <header className="relative isolate flex min-h-[46svh] items-end overflow-hidden pb-10 pt-[calc(var(--header-h)+3rem)] text-white sm:min-h-[52svh] sm:pb-14">
      <Picture image={image} locale={locale} alt="" fill preload sizes="100vw" className="-z-10 object-cover" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-ink-950/75 via-ink-950/25 to-ink-950/30" />
      <div className="container-x">
        {eyebrow && <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-sea-100">{eyebrow}</p>}
        <h1 className="max-w-3xl text-5xl leading-[1.02] sm:text-6xl lg:text-7xl">{title}</h1>
        {intro && <p className="mt-4 max-w-2xl text-base text-white/85 sm:text-lg">{intro}</p>}
      </div>
    </header>
  );
}
