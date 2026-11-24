import { z } from "zod";

/** Localized string map. */
const L = z.record(z.string(), z.string()).default({});

/**
 * All hotel settings, grouped. Each group is stored as one row in the `Setting` table
 * (key = group name) and edited from /admin/settings. Defaults apply when a row is missing.
 */
export const settingsSchema = z.object({
  hotel: z
    .object({
      name: L,
      legalName: z.string().default(""),
      tagline: L,
      stars: z.number().int().min(0).max(5).default(4),
      address: L,
      city: z.string().default("Kobuleti"),
      postalCode: z.string().default("6200"),
      region: z.string().default("Adjara"),
      countryCode: z.string().default("GE"),
      lat: z.number().default(41.8361875),
      lng: z.number().default(41.7778125),
      googleMapsUrl: z.string().default(""),
      checkInFrom: z.string().default("14:00"),
      checkOutUntil: z.string().default("12:00"),
      /** Free text shown on the contact page, e.g. "Reception 08:00–23:00 · Restaurant 09:00–22:00" */
      openingHours: L,
      beachDistanceM: z.number().int().nullable().default(null),
      airportDistanceKm: z.number().default(30),
      airportDriveMin: z.number().int().default(35),
    })
    .prefault({}),
  contact: z
    .object({
      phone: z.string().default("+995 592 44 11 15"),
      phone2: z.string().default(""),
      email: z.string().default("info@royalpalacehotel.ge"),
      bookingEmail: z.string().default("booking@royalpalacehotel.ge"),
      whatsapp: z.string().default("995592441115"), // digits only, with country code
      viber: z.string().default("+995592441115"),
      telegram: z.string().default(""), // username without @ — hidden when empty
      instagram: z.string().default(""),
      facebook: z.string().default(""),
      receptionHours: L,
    })
    .prefault({}),
  trust: z
    .object({
      googleRating: z.number().min(0).max(5).default(4.5),
      googleReviewCount: z.number().int().min(0).default(46),
      googleReviewsUrl: z.string().default(""),
      showBestPriceBadge: z.boolean().default(true),
    })
    .prefault({}),
  booking: z
    .object({
      baseCurrency: z.string().default("GEL"),
      maxAdvanceDays: z.number().int().min(1).max(1000).default(450),
      freeCancellationDays: z.number().int().min(0).max(365).default(7),
      depositPercent: z.number().int().min(0).max(100).default(30),
      allowPayAtHotel: z.boolean().default(true),
      allowDeposit: z.boolean().default(true),
      allowFullPrepay: z.boolean().default(true),
      /** City/tourist tax per adult per night in tetri (0 = not charged) */
      cityTaxPerPersonNight: z.number().int().default(0), // minor units
      cityTaxChildren: z.boolean().default(false),
      /** Minutes a room is held while the guest completes checkout / payment */
      holdMinutes: z.number().int().min(5).max(120).default(15),
      /** Same-day arrivals can be booked online until this local (Asia/Tbilisi) time */
      sameDayCutoff: z.string().regex(/^\d{2}:\d{2}$/).default("20:00"),
      /** Online payment provider for deposits / prepayment: mock (testing) | tbc | bog */
      paymentProvider: z.enum(["mock", "tbc", "bog"]).default("mock"),
      /** Cancellations inside the free window are charged this: first night of each room */
      lateCancellationPenalty: z.enum(["first_night", "percent", "full_stay", "none"]).default("first_night"),
      lateCancellationPercent: z.number().int().min(0).max(100).default(50),
      noShowPenalty: z.enum(["first_night", "percent", "full_stay", "none"]).default("first_night"),
      noShowPercent: z.number().int().min(0).max(100).default(100),
      maxRoomsPerBooking: z.number().int().min(1).max(10).default(4),
      vatIncluded: z.boolean().default(true),
      childFreeUnderAge: z.number().int().default(6),
    })
    .prefault({}),
  media: z
    .object({
      heroImageIds: z.array(z.string()).default([]),
      /** Optional portrait image used for the hero on phones (art direction) */
      heroMobileImageId: z.string().default(""),
      heroVideoUrl: z.string().default(""),
      ogImageId: z.string().default(""),
      logoUrl: z.string().default(""),
    })
    .prefault({}),
  notifications: z
    .object({
      adminEmails: z.array(z.string()).default([]),
      telegramEnabled: z.boolean().default(false),
      /** Telegram chat / group id for alerts (the bot token stays in .env) */
      telegramChatId: z.string().default(""),
    })
    .prefault({}),
  /** Automatic guest e-mails (sent by the daily job). Templates: Admin → E-mails & messages. */
  automation: z
    .object({
      preArrivalEnabled: z.boolean().default(true),
      preArrivalDays: z.number().int().min(1).max(30).default(3),
      postStayEnabled: z.boolean().default(true),
      postStayDays: z.number().int().min(0).max(30).default(1),
    })
    .prefault({}),
  currency: z
    .object({
      /** Update USD/EUR rates daily from the National Bank of Georgia */
      autoUpdate: z.boolean().default(false),
      lastUpdatedAt: z.string().default(""),
    })
    .prefault({}),
});

export type Settings = z.infer<typeof settingsSchema>;
export type SettingsGroup = keyof Settings;
export const settingsGroups = Object.keys(settingsSchema.shape) as SettingsGroup[];
