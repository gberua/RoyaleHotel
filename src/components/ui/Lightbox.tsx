"use client";
import Lightbox from "yet-another-react-lightbox";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import Counter from "yet-another-react-lightbox/plugins/counter";
import "yet-another-react-lightbox/styles.css";
import "yet-another-react-lightbox/plugins/counter.css";

export type Slide = { src: string; width: number; height: number; alt: string };

/** Loaded on demand (next/dynamic), so the lightbox costs nothing until a photo is opened. */
export default function PhotoLightbox({ slides, index, onClose }: { slides: Slide[]; index: number; onClose: () => void }) {
  // Use next/image's optimizer for responsive, AVIF/WebP slides
  const opt = (s: Slide) => ({
    src: `/_next/image?url=${encodeURIComponent(s.src)}&w=1920&q=75`,
    alt: s.alt,
    width: s.width,
    height: s.height,
    srcSet: [828, 1280, 1920, 2560]
      .filter((w) => w <= Math.max(s.width, 828))
      .map((w) => ({ src: `/_next/image?url=${encodeURIComponent(s.src)}&w=${w}&q=75`, width: w, height: Math.round((s.height / s.width) * w) })),
  });
  return (
    <Lightbox
      open
      close={onClose}
      index={index}
      slides={slides.map(opt)}
      plugins={[Zoom, Counter]}
      controller={{ closeOnBackdropClick: true, closeOnPullDown: true }}
      styles={{ container: { backgroundColor: "rgba(7, 31, 39, 0.96)" } }}
    />
  );
}
