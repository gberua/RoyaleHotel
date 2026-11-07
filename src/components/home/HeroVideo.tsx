"use client";
import { useEffect, useRef, useState } from "react";

type Conn = { saveData?: boolean; effectiveType?: string };

/**
 * Background video over the hero photo. The photo (with its Ken Burns zoom) is always there underneath;
 * the video only fades in once it is really playing, so a blocked autoplay (iPhone Low Power Mode, data saver)
 * never shows a frozen frame. Not loaded at all with Reduce Motion, Save-Data or a genuinely slow (2G) connection.
 */
export function HeroVideo({ src, poster }: { src: string; poster?: string }) {
  const [use, setUse] = useState(false);
  const [playing, setPlaying] = useState(false);
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const conn = (navigator as Navigator & { connection?: Conn }).connection;
    const slow = !!conn?.saveData || conn?.effectiveType === "slow-2g" || conn?.effectiveType === "2g";
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- decided once on the device, after hydration
    if (!slow && !reduce) setUse(true);
  }, []);

  useEffect(() => {
    const v = ref.current;
    if (!use || !v) return;
    // React doesn't write the `muted` attribute; iOS only autoplays videos that are muted
    v.muted = true;
    v.defaultMuted = true;
    v.setAttribute("muted", "");
    v.play().catch(() => setUse(false)); // autoplay refused → keep the animated photo
  }, [use]);

  if (!use) return null;
  return (
    <video
      ref={ref}
      className={`absolute inset-0 -z-20 h-full w-full object-cover transition-opacity duration-1000 ${playing ? "opacity-100" : "opacity-0"}`}
      src={src}
      poster={poster}
      autoPlay
      muted
      loop
      playsInline
      preload="auto"
      aria-hidden
      onPlaying={() => setPlaying(true)}
      onError={() => setUse(false)}
    />
  );
}
