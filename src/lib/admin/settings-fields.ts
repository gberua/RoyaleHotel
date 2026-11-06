import type { SettingsGroup } from "@/lib/settings-schema";

/**
 * What the Settings screen shows, section by section. Each section edits some keys of one settings group;
 * keys not listed keep their stored value. Labels come from admin.settings.f.<key>.
 */
export type FieldKind = "text" | "email" | "tel" | "url" | "time" | "localized" | "localizedLong" | "int" | "decimal" | "money" | "percent" | "bool" | "select" | "list";
export type FieldDef = { key: string; kind: FieldKind; options?: string[]; wide?: boolean };
export type SectionDef = { id: string; group: SettingsGroup; fields: FieldDef[] };

export const SETTINGS_SECTIONS: SectionDef[] = [
  {
    id: "hotel", group: "hotel", fields: [
      { key: "name", kind: "localized" }, { key: "tagline", kind: "localized" }, { key: "legalName", kind: "text" },
      { key: "address", kind: "localized", wide: true }, { key: "city", kind: "text" }, { key: "postalCode", kind: "text" },
      { key: "googleMapsUrl", kind: "url", wide: true }, { key: "lat", kind: "decimal" }, { key: "lng", kind: "decimal" },
      { key: "checkInFrom", kind: "time" }, { key: "checkOutUntil", kind: "time" },
      { key: "openingHours", kind: "localizedLong", wide: true },
      { key: "beachDistanceM", kind: "int" }, { key: "airportDistanceKm", kind: "decimal" }, { key: "airportDriveMin", kind: "int" }, { key: "stars", kind: "int" },
    ],
  },
  {
    id: "contact", group: "contact", fields: [
      { key: "phone", kind: "tel" }, { key: "phone2", kind: "tel" }, { key: "email", kind: "email" }, { key: "bookingEmail", kind: "email" },
      { key: "whatsapp", kind: "tel" }, { key: "viber", kind: "tel" }, { key: "telegram", kind: "text" },
      { key: "instagram", kind: "url" }, { key: "facebook", kind: "url" }, { key: "receptionHours", kind: "localized", wide: true },
    ],
  },
  {
    id: "booking", group: "booking", fields: [
      { key: "depositPercent", kind: "percent" }, { key: "freeCancellationDays", kind: "int" },
      { key: "lateCancellationPenalty", kind: "select", options: ["first_night", "percent", "full_stay", "none"] }, { key: "lateCancellationPercent", kind: "percent" },
      { key: "noShowPenalty", kind: "select", options: ["first_night", "percent", "full_stay", "none"] }, { key: "noShowPercent", kind: "percent" },
      { key: "sameDayCutoff", kind: "time" }, { key: "holdMinutes", kind: "int" }, { key: "maxAdvanceDays", kind: "int" }, { key: "maxRoomsPerBooking", kind: "int" },
      { key: "cityTaxPerPersonNight", kind: "money" }, { key: "cityTaxChildren", kind: "bool" }, { key: "vatIncluded", kind: "bool" },
    ],
  },
  {
    id: "payments", group: "booking", fields: [
      { key: "allowPayAtHotel", kind: "bool" }, { key: "allowDeposit", kind: "bool" }, { key: "allowFullPrepay", kind: "bool" },
      { key: "paymentProvider", kind: "select", options: ["mock", "tbc", "bog"] },
    ],
  },
  {
    id: "notifications", group: "notifications", fields: [
      { key: "adminEmails", kind: "list", wide: true }, { key: "telegramEnabled", kind: "bool" }, { key: "telegramChatId", kind: "text" },
    ],
  },
  {
    id: "trust", group: "trust", fields: [
      { key: "googleRating", kind: "decimal" }, { key: "googleReviewCount", kind: "int" }, { key: "googleReviewsUrl", kind: "url", wide: true }, { key: "showBestPriceBadge", kind: "bool" },
    ],
  },
];
