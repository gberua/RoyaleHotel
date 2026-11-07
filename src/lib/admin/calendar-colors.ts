/** Calendar bar colours by booking status / block kind (shared by the server page legend and the client grid). */
export const BAR_COLORS: Record<string, string> = {
  PENDING: "bg-amber-300 text-amber-950", HOLD: "bg-amber-200 text-amber-950 [background-image:repeating-linear-gradient(45deg,transparent,transparent_6px,rgb(255_255_255/.45)_6px,rgb(255_255_255/.45)_12px)]",
  CONFIRMED: "bg-sea-500 text-ink-950", CHECKED_IN: "bg-emerald-500 text-white", CHECKED_OUT: "bg-ink-300 text-ink-900",
  EXTERNAL: "bg-violet-400 text-white",
  MAINTENANCE: "bg-ink-300 text-ink-900 [background-image:repeating-linear-gradient(135deg,transparent,transparent_5px,rgb(255_255_255/.35)_5px,rgb(255_255_255/.35)_10px)]",
};
