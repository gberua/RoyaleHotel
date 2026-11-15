import { getImageProps } from "next/image";
import type { Img } from "@/lib/data";
import { tr } from "@/lib/i18n-content";
import { HeroVideo } from "./HeroVideo";

/**
 * "Horizon" hero — full-screen sea image (or video), the hotel name revealed letter by letter,
 * a turquoise horizon line drawn outward from the centre, the tagline and a scroll cue.
 * Pure CSS animation; with Reduce Motion the title simply fades in and the photo doesn't zoom.
 */
/** Art-directed hero photo: portrait image on phones held upright, landscape everywhere else. */
function HeroPicture({ image, mobile, locale }: { image: Img; mobile: Img | null; locale: string }) {
  const common = { alt: tr(image.alt, locale), sizes: "100vw", fill: true, quality: 75 } as const;
  const { props: { srcSet: desktopSet, ...imgProps } } = getImageProps({ ...common, src: image.url, fetchPriority: "high", loading: "eager" });
  const mobileSet = mobile ? getImageProps({ ...common, src: mobile.url }).props.srcSet : null;
  return (
    <picture>
      {mobileSet && <source media="(max-width: 767px) and (orientation: portrait)" srcSet={mobileSet} sizes="100vw" />}
      <source srcSet={desktopSet} sizes="100vw" />
      {/* eslint-disable-next-line jsx-a11y/alt-text -- alt comes from imgProps */}
      <img {...imgProps} className="h-full w-full object-cover" />
    </picture>
  );
}

export function HorizonHero({ name, tagline, scrollLabel, image, mobileImage, videoUrl, locale }: {
  name: string;
  tagline: string;
  scrollLabel: string;
  image: Img | undefined;
  mobileImage?: Img | null;
  videoUrl?: string;
  locale: string;
}) {
  const words = name.split(" ");
  let index = 0;
  const letterDelay = 70;
  const lettersDone = 250 + Array.from(name.replace(/\s/g, "")).length * letterDelay;

  return (
    <section className="relative isolate flex h-[100svh] min-h-[34rem] items-center justify-center overflow-hidden bg-ink-950 text-white" aria-label={name}>
      <div
        className="hero-kenburns absolute inset-0 -z-20 bg-cover bg-center"
        style={image?.blurDataUrl ? { backgroundImage: `url(${image.blurDataUrl})` } : undefined}
      >
        {image && <HeroPicture image={image} mobile={mobileImage ?? null} locale={locale} />}
      </div>
      {videoUrl && <HeroVideo src={videoUrl} poster={image?.url} />}
      {/* readability: soft top/bottom gradient + gentle vignette */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-ink-950/45 via-ink-950/10 to-ink-950/55" />
      {/* phones: the portrait photo has bright clouds behind the title — a touch more tint */}
      <div className="absolute inset-0 -z-10 bg-ink-950/15 md:hidden" />
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_center,transparent_35%,rgb(7_31_39/0.35)_100%)]" />

      <div className="px-4 text-center">
        {/* Words are flex items: the 0.28em gap exists only BETWEEN words on the same line, so when a long
            name breaks onto two lines on small phones ("Royal" / "Palace") each line is exactly centred. */}
        <h1 aria-label={name} className="hero-title flex flex-wrap justify-center gap-x-[0.28em] font-display text-[clamp(3.4rem,17vw,7.5rem)] leading-[1] drop-shadow-[0_2px_24px_rgb(7_31_39/0.25)] lg:flex-nowrap lg:whitespace-nowrap lg:text-[min(10vw,10rem)]">
          {words.map((word, w) => (
            <span key={w} className="inline-block whitespace-nowrap" aria-hidden>
              {Array.from(word).map((ch) => {
                const i = index++;
                return (
                  <span key={i} className="hero-letter inline-block" style={{ animationDelay: `${250 + i * letterDelay}ms` }}>
                    {ch}
                  </span>
                );
              })}
            </span>
          ))}
        </h1>
        <div className="hero-horizon mx-auto mt-8 h-px w-[min(34rem,72vw)] bg-sea-400 sm:mt-12" style={{ animationDelay: `${lettersDone}ms` }} aria-hidden />
        {/* letter-spacing also follows the LAST letter; the equal negative right margin centres the visible text */}
        <p className="hero-fade -mr-[0.42em] mt-5 text-[0.72rem] font-semibold uppercase tracking-[0.42em] text-white/90 sm:mt-6 sm:text-xs" style={{ animationDelay: `${lettersDone + 450}ms` }}>
          {tagline}
        </p>
      </div>

      <a href="#intro" className="hero-fade group absolute bottom-6 left-1/2 flex -translate-x-1/2 flex-col items-center gap-3 text-[0.65rem] font-semibold uppercase tracking-[0.3em] text-white/80 sm:bottom-8" style={{ animationDelay: `${lettersDone + 800}ms` }}>
        {scrollLabel}
        <span className="relative block h-12 w-px overflow-hidden bg-white/25" aria-hidden>
          <span className="scroll-dot absolute left-0 top-0 h-4 w-px bg-white" />
        </span>
      </a>
    </section>
  );
}
