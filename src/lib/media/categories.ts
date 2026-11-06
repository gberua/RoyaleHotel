export const MEDIA_CATEGORIES = ["exterior", "lobby", "room", "restaurant", "pool", "beach", "view", "kobuleti", "unsorted"] as const;
export type MediaCategory = (typeof MEDIA_CATEGORIES)[number];
