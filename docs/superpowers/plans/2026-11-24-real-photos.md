# Real Hotel Photos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the demo stock photos with about 30 real Royal Palace photos on the local site, with one repeatable command that can later run against the live site.

**Architecture:** `scripts/import-images.ts` gains a source-folder option and a richer catalog. The catalog (in git) names each photo's category, alt text, gallery position, room, slot, service and offer. The photos themselves stay outside git. One query change makes real photos sort before demo ones.

**Tech Stack:** Next.js 16.4.5, Prisma 7 + PostgreSQL, sharp, tsx, vitest.

**Spec:** `docs/superpowers/specs/2026-11-22-real-photos-design.md`

## Global Constraints

- Never commit the original photos (about 45 MB). They are read from `~/Downloads/royal-palace-pictures` (`os.homedir()`, so the same default works on Windows and macOS).
- Every new photo has alt text in `ka`, `en` and `ru`.
- The gallery shows real photos only. Standard Double shows real photos only.
- Not imported: `royal palace/IMG_5131.jpg` (ad banner) and `royal palace/F83275D4-….PNG` (looks rendered).
- No page layout or design changes. No room-list changes (job 2).
- Stays stock: restaurant service photo, the 7 Kobuleti attractions, room types other than `standard-double`.
- npm only. Read `AGENTS.md` before touching Next.js code.
- No push to `main`. Work on `real-photos`.

## Review Focus

1. **Re-running the import** (alt text edited, or the live run after the local one): must update rows and links in place, never create duplicate Media rows or duplicate room links. Test in Task 2.
2. **Windows paths:** a catalog key `palasi 3/x.jpg` must match a file found as `palasi 3\x.jpg`. Test in Task 1.
3. **A catalog entry whose file is missing** (typo, or a different download): the run must list it and exit non-zero, not silently import 29 of 30. Test in Task 1.
4. **Phone hero:** `heroMobileImageId` may still point at a demo sea photo on the live site; phones would then show stock next to real photos. The import clears it. Test in Task 1 (`heroSettings`).
5. **A category with no real photo** (lobby, restaurant): demo photos must still be returned, after real ones, not dropped. Test in Task 3.

---

## File structure

| File | Responsibility |
|---|---|
| `scripts/lib/photo-catalog.ts` (new) | Pure helpers: path normalising, catalog parsing and validation, hero settings. No DB, no file I/O. |
| `scripts/import-images.ts` (modify) | Reads files, runs the pipeline, writes Media rows and links using the helpers. |
| `assets/real-photos/catalog.json` (new) | The photo list for this job. |
| `src/lib/data.ts` (modify) | `getMediaByCategory` sorts real before demo. |
| `tests/unit/photo-catalog.test.ts` (new) | Helper tests. |
| `tests/integration/media.test.ts` (new) | Sorting and re-run tests against the test database. |

---

### Task 1: Catalog helpers

**Files:**
- Create: `scripts/lib/photo-catalog.ts`
- Test: `tests/unit/photo-catalog.test.ts`

**Interfaces — Produces:**

```ts
export const CATEGORIES = ["exterior", "lobby", "room", "restaurant", "pool", "beach", "view", "kobuleti"] as const;
export type Entry = {
  name?: string; category?: string; alt?: Record<string, string>;
  roomType?: string; roomOrder?: number;          // attach to this room type, in this order
  gallery?: boolean | number;                     // number = position on /gallery
  slot?: "hero" | "cta"; hero?: boolean;          // hero: legacy flag, appends
  services?: string[]; offers?: string[];         // Service.key / Offer.slug to point at this photo
  skip?: boolean;
};
export type Catalog = {
  onlyListed: boolean;            // true: files not in `photos` are ignored
  demoOutOfGallery: boolean;      // true: every isDemo photo leaves /gallery
  replaceRoomPhotos: string[];    // room type slugs whose existing photo links are removed first
  photos: Record<string, Entry>;  // key: path relative to the source folder, forward slashes
};
export function toPosix(rel: string, sep?: string): string;
export function parseCatalog(json: unknown): Catalog;   // accepts the old flat shape { "file.jpg": Entry }
export function entryFor(catalog: Catalog, rel: string): Entry | undefined;  // by posix rel, then by basename
export function categoryFor(rel: string, entry: Entry | undefined): string;  // entry.category → first folder if a category → "unsorted"
export function missingFiles(catalog: Catalog, rels: string[]): string[];    // catalog keys with no file (skip entries excluded)
export function problems(catalog: Catalog): string[];   // entries missing ka/en/ru alt; two entries with the same slot
export function heroSettings(media: Record<string, unknown>, ids: { hero?: string; cta?: string; appended: string[] }): Record<string, unknown>;
```

`heroSettings` rules: `heroImageIds[0]` is `ids.hero` if given, else the current first; `heroImageIds[1]` is `ids.cta` if given, else the current second; `appended` ids follow, de-duplicated. When `ids.hero` is given, set `ogImageId` to it and `heroMobileImageId` to `""`. Other keys pass through.

- [ ] **Step 1: Write the failing tests**

```ts
it("matches catalog keys on Windows paths", () => {
  expect(toPosix("palasi 3\\a.jpg", "\\")).toBe("palasi 3/a.jpg");
  const c = parseCatalog({ onlyListed: true, photos: { "palasi 3/a.jpg": { category: "pool" } } });
  expect(entryFor(c, toPosix("palasi 3\\a.jpg", "\\"))?.category).toBe("pool");
});
it("reads the old flat catalog and falls back to the folder name", () => {
  const c = parseCatalog({ "IMG_1.jpg": { category: "view" } });
  expect(c).toMatchObject({ onlyListed: false, demoOutOfGallery: false, replaceRoomPhotos: [] });
  expect(entryFor(c, "any/IMG_1.jpg")?.category).toBe("view");
  expect(categoryFor("pool/x.jpg", undefined)).toBe("pool");
  expect(categoryFor("palasi2/x.jpg", undefined)).toBe("unsorted");
});
it("reports catalog entries without a file, and bad entries", () => {
  const c = parseCatalog({ onlyListed: true, photos: {
    "a.jpg": { slot: "hero", alt: { ka: "ა", en: "a", ru: "а" } },
    "b.jpg": { slot: "hero", alt: { ka: "ბ", en: "b" } },
    "c.jpg": { skip: true } } });
  expect(missingFiles(c, ["a.jpg"])).toEqual(["b.jpg"]);
  expect(problems(c)).toEqual([expect.stringContaining("b.jpg"), expect.stringContaining("hero")]);
});
it("sets hero and CTA explicitly and clears the demo phone hero", () => {
  expect(heroSettings({ heroImageIds: ["old", "oldCta", "x"], heroMobileImageId: "demo", logoUrl: "l" }, { hero: "H", cta: "C", appended: [] }))
    .toEqual({ heroImageIds: ["H", "C"], heroMobileImageId: "", ogImageId: "H", logoUrl: "l" });
  expect(heroSettings({ heroImageIds: ["old"] }, { appended: ["n", "old"] })).toEqual({ heroImageIds: ["old", "n"] });
});
```

- [ ] **Step 2:** Run `npx vitest run tests/unit/photo-catalog.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3:** Implement the helpers in `scripts/lib/photo-catalog.ts`.
- [ ] **Step 4:** Run the same command. Expected: 4 passed.
- [ ] **Step 5:** Commit `Photo catalog helpers: Windows paths, validation, explicit hero slots`.

### Task 2: Import script uses the catalog

**Files:**
- Modify: `scripts/import-images.ts` (export `importPhotos`, keep the CLI at the bottom behind an "is main module" check)
- Modify: `package.json` (add `"photos:real": "tsx scripts/import-images.ts --real"`)
- Test: `tests/integration/media.test.ts`

**Interfaces:**
- Consumes: everything from Task 1.
- Produces: `export async function importPhotos(db: PrismaClient, opts: { dir: string; catalogPath: string; sourcePrefix: string }): Promise<{ imported: number; updated: number; skipped: number; failed: number }>`

CLI: `--dir <folder>`, `--catalog <file>`; `--real` is short for `--dir ~/Downloads/royal-palace-pictures --catalog assets/real-photos/catalog.json` with `sourcePrefix` `real`. `REAL_PHOTOS_DIR` in the environment overrides the folder. With no flags the behaviour is as today (`assets/google-maps`, prefix `google-maps`).

Behaviour, in order:
1. Parse the catalog. If `problems()` or `missingFiles()` return anything, print each line and throw before touching the database.
2. For each file (skipping unlisted files when `onlyListed`): find the Media row by checksum of the original. New → `processImage` and create. Existing → update `category`, `alt`, `inGallery`, `galleryOrder`, `isDemo: false`. `gallery: 7` means `inGallery: true, galleryOrder: 7`; `gallery: false` or absent on a listed photo means not in the gallery.
3. `replaceRoomPhotos`: delete those room types' `RoomTypePhoto` links (links only, never Media). Then create links for entries with `roomType`, ordered by `roomOrder`.
4. `services` / `offers`: `updateMany` the `mediaId`.
5. `demoOutOfGallery`: `updateMany({ where: { isDemo: true }, data: { inGallery: false } })`.
6. Write the `media` setting from `heroSettings`.

- [ ] **Step 1: Write the failing test.** Build a temp folder with two small JPEGs made by `sharp` (`a/one.jpg`, `a/two.jpg`) and a catalog; mock `@/lib/media/process` so nothing is written to storage. Seed one room type `standard-double` with a demo photo link, one demo gallery photo, one `Service` key `pool`, and a `media` setting `{ heroImageIds: ["demoHero"], heroMobileImageId: "demoMobile" }`.

```ts
const first = await importPhotos(db, opts);
expect(first).toMatchObject({ imported: 2, updated: 0, failed: 0 });
const second = await importPhotos(db, opts);                       // re-run
expect(second).toMatchObject({ imported: 0, updated: 2 });
expect(await db.media.count({ where: { isDemo: false } })).toBe(2);
const room = await db.roomType.findUniqueOrThrow({ where: { slug: "standard-double" }, include: { photos: { include: { media: true }, orderBy: { sortOrder: "asc" } } } });
expect(room.photos.map((p) => p.media.isDemo)).toEqual([false]);   // demo cover detached, no duplicate link
expect(await db.media.count({ where: { isDemo: true, inGallery: true } })).toBe(0);
expect((await db.service.findFirstOrThrow({ where: { key: "pool" } })).mediaId).toBe(room.photos[0].mediaId);
expect((await db.setting.findUniqueOrThrow({ where: { key: "media" } })).value).toMatchObject({ heroImageIds: [expect.any(String)], heroMobileImageId: "" });
// a catalog naming a file that is not there changes nothing
await expect(importPhotos(db, { ...opts, catalogPath: badCatalog })).rejects.toThrow(/missing/i);
```

- [ ] **Step 2:** Run `npx vitest run tests/integration/media.test.ts`. Expected: FAIL, `importPhotos` is not exported.
- [ ] **Step 3:** Implement as described above.
- [ ] **Step 4:** Run the test. Expected: PASS. Run `npm run images` with the empty `assets/google-maps`. Expected: the "No photos found" message, exit 0.
- [ ] **Step 5:** Commit `Import script: source folder option, catalog slots, re-runnable`.

### Task 3: Real photos sort before demo ones

**Files:**
- Modify: `src/lib/data.ts` (`getMediaByCategory`)
- Test: `tests/integration/media.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it("a real photo wins over a demo one; demo photos still fill a category with no real photo", async () => {
  // pool: demo galleryOrder 0, real galleryOrder 5 · lobby: demo only
  expect((await getMediaByCategory("pool", 1))[0].isDemo).toBe(false);
  expect((await getMediaByCategory("pool", 2)).map((m) => m.isDemo)).toEqual([false, true]);
  expect(await getMediaByCategory("lobby", 1)).toHaveLength(1);
});
```

- [ ] **Step 2:** Run it. Expected: FAIL, the first pool photo is the demo one.
- [ ] **Step 3:** Change the order to `[{ isDemo: "asc" }, { galleryOrder: "asc" }, { createdAt: "asc" }]`.
- [ ] **Step 4:** Run it. Expected: PASS.
- [ ] **Step 5:** Commit `Real photos sort before demo photos in category lookups`.

### Task 4: The catalog, and the local import

**Files:**
- Create: `assets/real-photos/catalog.json`

Catalog header: `"onlyListed": true, "demoOutOfGallery": true, "replaceRoomPhotos": ["standard-double"]`.

Photo list (from the spec's photo plan; `(e)` = the edited file in `royal palace/`, otherwise the file in `palasi2/` or `palasi 3/`):

| Photos | category | Extra |
|---|---|---|
| `DJI_…0803_D` | kobuleti | `slot: "hero"` |
| `DJI_…0810_D` | beach | `slot: "cta"`, `services: ["beach"]` |
| `0L9A7013`, `0L9A7010`, `0L9A7005`, `DJI_…0799_D`, `DJI_…0815_D` | exterior | |
| `0L9A7291` (e) | pool | `services: ["pool"]` |
| `0L9A7290` | pool | `offers: ["early-summer"]` |
| `0L9A6879` | pool | |
| `0L9A6958` (e) | view | `offers: ["family-summer"]` |
| `0L9A6965`, `0L9A6773` | view | |
| `DJI_…0796_D`, `DJI_…0813_D` | kobuleti | |
| `0L9A7173` (e), `0L9A6946` (e), `0L9A7176` (e), `0L9A7147` (e), `0L9A7152`, `0L9A7139`, `0L9A7156` (e), `0L9A7264` (e), `0L9A6749` | room | `roomType: "standard-double"`, `roomOrder` 0–8 in this order |
| `0L9A7245` (e), `0L9A7241`, `0L9A7249`, `0L9A6747`, `0L9A6757`, `0L9A7215`, `0L9A7135` | room | gallery only |

Every photo is in the gallery. Gallery order: hero aerial, entrance, pool, sea view, then alternate rooms with outdoor shots so no run of similar frames; the Standard Double cover has the lowest `galleryOrder` of the room photos (it becomes the Rooms page band).

- [ ] **Step 1:** Look at every listed photo (downscaled) and write `name` (descriptive, English, kebab-case) and `alt` in `ka`, `en`, `ru` describing what is actually in the frame. If a photo does not show what the spec says, note it for the user instead of guessing.
- [ ] **Step 2:** Run `npm run photos:real`. Expected: about 30 imported, 0 failed.
- [ ] **Step 3:** Run it again. Expected: 0 imported, same number updated.
- [ ] **Step 4:** Check the database: no demo photo in the gallery; `standard-double` has 9 photos, none demo; `pool` and `beach` services and both offers point at real photos; `heroImageIds` are the two drone shots.
- [ ] **Step 5:** Commit the catalog: `Real photo catalog: 30 photos with KA/EN/RU alt text`.

### Task 5: Verify on the site, document

**Files:**
- Modify: `README.md` (photo section: the `photos:real` command, the folder it reads, re-run behaviour, and that the live run needs the live `DATABASE_URL` and storage settings)

- [ ] **Step 1:** `npm run lint`, `npx next typegen && npm run typecheck`, `npm test`. Expected: all clean.
- [ ] **Step 2:** `npm run build && npm start`; open home, gallery, rooms, Standard Double, amenities, offers, Kobuleti at desktop and phone width in ka, en and ru. Expected: real photos in every slot the spec lists, no broken images, no console errors, no demo photo in the gallery or on Standard Double.
- [ ] **Step 3:** `E2E_BASE_URL=http://localhost:3000 npx playwright test`. Expected: same pass count as before the change.
- [ ] **Step 4:** Update the README and commit `README: importing the real hotel photos`.

## Not in this plan

- The live import. It waits on the Supabase decision in the spec; the command is the same with live credentials.
- Full-size originals for the hero and CTA (swap in with Admin → Media → Replace when the photographer sends them).
