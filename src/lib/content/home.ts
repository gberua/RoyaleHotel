/** Home page building blocks the owner can reorder / hide, and the texts editable per block (KA/EN/RU). */
export const HOME_SECTIONS = ["trust", "welcome", "rooms", "amenities", "beach", "reviews", "gallery", "location", "cta"] as const;
export type HomeSection = (typeof HOME_SECTIONS)[number];

/** text key → message key used when the admin left it empty (null = only editable, no built-in text) */
export const HOME_TEXTS: Record<HomeSection | "hero", Record<string, string | null>> = {
  hero: { heroTagline: "home.heroEyebrow" },
  trust: {},
  welcome: { welcomeEyebrow: "home.welcomeEyebrow", welcomeTitle: null, welcomeText: null },
  rooms: { roomsEyebrow: "home.featuredEyebrow", roomsTitle: "home.featuredTitle" },
  amenities: { amenitiesEyebrow: "home.amenitiesEyebrow", amenitiesTitle: "home.amenitiesTitle" },
  beach: { beachEyebrow: "home.beachEyebrow", beachTitle: "home.beachTitle", beachText: null },
  reviews: { reviewsEyebrow: "home.reviewsEyebrow" },
  gallery: { galleryEyebrow: "home.galleryEyebrow", galleryTitle: "home.galleryTitle" },
  location: { locationEyebrow: "home.locationEyebrow" },
  cta: { ctaTitle: "home.ctaTitle", ctaText: "home.ctaText" },
};
export const LONG_TEXTS = new Set(["welcomeText", "beachText", "ctaText", "intro", "tagline"]);

export function homeLayout(sections: { order?: string[]; hidden?: string[] }) {
  const known = new Set<string>(HOME_SECTIONS);
  const order = [...(sections.order ?? []).filter((s) => known.has(s)), ...HOME_SECTIONS.filter((s) => !(sections.order ?? []).includes(s))] as HomeSection[];
  const hidden = new Set(sections.hidden ?? []);
  return { order, hidden, visible: order.filter((s) => !hidden.has(s)) };
}
