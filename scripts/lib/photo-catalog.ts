/**
 * Catalog for `npm run images` / `npm run photos:real`: which photo goes where.
 * Pure helpers only (no database, no file access) so they can be unit-tested.
 */
import { sep as platformSep } from "node:path";

export const CATEGORIES = ["exterior", "lobby", "room", "restaurant", "pool", "beach", "view", "kobuleti"] as const;
const LOCALES = ["ka", "en", "ru"] as const;

export type Entry = {
  name?: string;
  category?: string;
  alt?: Record<string, string>;
  /** attach to this room type (slug), in this order */
  roomType?: string;
  roomOrder?: number;
  /** true = on /gallery; a number = on /gallery at this position */
  gallery?: boolean | number;
  /** "hero" replaces the first home-page hero image, "cta" the image behind the booking call-to-action */
  slot?: "hero" | "cta";
  /** legacy: add to the end of the hero list */
  hero?: boolean;
  /** Service keys / Offer slugs that should show this photo */
  services?: string[];
  offers?: string[];
  /** trim the photo before use, as fractions of its size: { left: 0.06 } cuts 6 % off the left edge */
  crop?: { left?: number; right?: number; top?: number; bottom?: number };
  skip?: boolean;
};

export type Catalog = {
  /** files that are not listed are ignored */
  onlyListed: boolean;
  /** every demo (stock) photo leaves /gallery */
  demoOutOfGallery: boolean;
  /** room type slugs whose current photo links are removed before the listed ones are attached */
  replaceRoomPhotos: string[];
  /** key: path relative to the source folder, with forward slashes */
  photos: Record<string, Entry>;
};

/** Windows gives `folder\file.jpg`; catalog keys and stored names always use `/`. */
export function toPosix(rel: string, sep: string = platformSep) {
  return sep === "/" ? rel : rel.split(sep).join("/");
}

/** Accepts the current shape ({ onlyListed, …, photos }) and the old flat one ({ "file.jpg": {…} }). */
export function parseCatalog(json: unknown): Catalog {
  const o = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
  const isNew = typeof o.photos === "object" && o.photos !== null && !Array.isArray(o.photos);
  return {
    onlyListed: isNew && o.onlyListed === true,
    demoOutOfGallery: isNew && o.demoOutOfGallery === true,
    replaceRoomPhotos: isNew && Array.isArray(o.replaceRoomPhotos) ? o.replaceRoomPhotos.map(String) : [],
    photos: (isNew ? o.photos : o) as Record<string, Entry>,
  };
}

export function entryFor(catalog: Catalog, rel: string): Entry | undefined {
  return catalog.photos[rel] ?? catalog.photos[rel.slice(rel.lastIndexOf("/") + 1)];
}

export function categoryFor(rel: string, entry: Entry | undefined) {
  const folder = rel.split("/")[0];
  return entry?.category ?? ((CATEGORIES as readonly string[]).includes(folder) ? folder : "unsorted");
}

/** Catalog entries that name a file which is not in the source folder. */
export function missingFiles(catalog: Catalog, rels: string[]) {
  const have = new Set(rels), names = new Set(rels.map((r) => r.slice(r.lastIndexOf("/") + 1)));
  return Object.entries(catalog.photos).filter(([key, e]) => !e.skip && !have.has(key) && !names.has(key)).map(([key]) => key);
}

/** Mistakes that should stop an import before it touches the database. */
export function problems(catalog: Catalog) {
  const out: string[] = [];
  const listed = Object.entries(catalog.photos).filter(([, e]) => !e.skip);
  if (catalog.onlyListed) {
    for (const [key, e] of listed) {
      const without = LOCALES.filter((l) => !e.alt?.[l]?.trim());
      if (without.length) out.push(`${key}: no alt text in ${without.join(", ")}`);
    }
  }
  for (const slot of ["hero", "cta"] as const) {
    const keys = listed.filter(([, e]) => e.slot === slot).map(([key]) => key);
    if (keys.length > 1) out.push(`slot "${slot}" is given to ${keys.length} photos: ${keys.join(", ")}`);
  }
  return out;
}

/**
 * The home page uses heroImageIds[0] as the hero and [1] behind the call-to-action. A photo with a slot
 * replaces that position; a new hero also becomes the share-preview image and clears the separate phone
 * hero (which would otherwise keep showing the old picture).
 */
export function heroSettings(media: Record<string, unknown>, ids: { hero?: string; cta?: string; appended: string[] }) {
  const current = Array.isArray(media.heroImageIds) ? (media.heroImageIds as string[]) : [];
  const explicit = Boolean(ids.hero || ids.cta);
  const list = explicit ? [ids.hero ?? current[0], ids.cta ?? current[1], ...ids.appended] : [...current, ...ids.appended];
  const out: Record<string, unknown> = { ...media, heroImageIds: [...new Set(list.filter(Boolean))] };
  // only when the hero actually changes: a re-run must not undo a phone hero or share image chosen in the admin since
  if (ids.hero && ids.hero !== current[0]) { out.ogImageId = ids.hero; out.heroMobileImageId = ""; }
  return out;
}

/**
 * Photo files are written by the storage driver of the machine that runs the import. A remote (live) database
 * with local storage would record /media/… addresses for files that only exist on this computer.
 */
export function storageProblem(databaseUrl: string | undefined, storageDriver: string | undefined): string | null {
  let host = "";
  try { host = new URL(databaseUrl ?? "").hostname; } catch { return "DATABASE_URL is missing or not a valid address"; }
  const local = ["localhost", "127.0.0.1", "::1", "[::1]", ""].includes(host);
  if (local || (storageDriver ?? "local") !== "local") return null;
  return `The database is remote (${host}) but photos would be saved on this computer. Set STORAGE_DRIVER (and its token) to the live site's storage, then run again.`;
}
