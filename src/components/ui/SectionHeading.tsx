export function SectionHeading({
  eyebrow, title, intro, align = "left", as: Tag = "h2", className = "",
}: { eyebrow?: string; title: string; intro?: string; align?: "left" | "center"; as?: "h1" | "h2"; className?: string }) {
  return (
    <div className={`${align === "center" ? "mx-auto text-center" : ""} max-w-2xl ${className}`}>
      {eyebrow && <p className="eyebrow mb-3">{eyebrow}</p>}
      <Tag className={`${Tag === "h1" ? "text-5xl sm:text-6xl lg:text-7xl" : "text-4xl sm:text-5xl"} leading-[1.05] text-ink-900`}>{title}</Tag>
      {intro && <p className="mt-4 text-base leading-relaxed text-ink-500 sm:text-lg">{intro}</p>}
    </div>
  );
}
