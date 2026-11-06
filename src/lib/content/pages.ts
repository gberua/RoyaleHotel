/** Public pages whose texts, SEO and (for home) section layout are editable under Admin → Website content. */
export const CONTENT_PAGES = ["home", "rooms", "amenities", "offers", "gallery", "kobuleti", "reviews", "contact", "faq", "footer"] as const;
export type ContentPage = (typeof CONTENT_PAGES)[number];
/** public path of each page (for the preview button); footer previews on the home page */
export const PAGE_PATH: Record<ContentPage, string> = { home: "", rooms: "/rooms", amenities: "/amenities", offers: "/offers", gallery: "/gallery", kobuleti: "/kobuleti", reviews: "/reviews", contact: "/contact", faq: "/faq", footer: "" };
export const FAQ_CATEGORIES = ["stay", "booking", "family", "travel", "general"] as const;
