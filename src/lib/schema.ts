import type { Settings } from "./settings-schema";
import { tr } from "./i18n-content";
import { SITE_URL } from "./seo";
import { absoluteUrl } from "./site-url";

export function hotelSchema(s: Settings, locale: string, opts: { image?: string; amenities?: string[]; priceRange?: string; url: string }) {
  return {
    "@context": "https://schema.org",
    "@type": "Hotel",
    "@id": `${SITE_URL}/#hotel`,
    name: tr(s.hotel.name, locale) || "Royal Palace",
    alternateName: "Royal Palace Kobuleti",
    url: opts.url,
    image: opts.image ? [absoluteUrl(opts.image)] : undefined,
    telephone: s.contact.phone,
    email: s.contact.email,
    starRating: { "@type": "Rating", ratingValue: s.hotel.stars },
    priceRange: opts.priceRange,
    checkinTime: s.hotel.checkInFrom,
    checkoutTime: s.hotel.checkOutUntil,
    address: {
      "@type": "PostalAddress",
      streetAddress: tr(s.hotel.address, "en").split(",")[0],
      addressLocality: "Kobuleti",
      addressRegion: "Adjara",
      postalCode: s.hotel.postalCode,
      addressCountry: "GE",
    },
    geo: { "@type": "GeoCoordinates", latitude: s.hotel.lat, longitude: s.hotel.lng },
    hasMap: s.hotel.googleMapsUrl || undefined,
    amenityFeature: opts.amenities?.map((name) => ({ "@type": "LocationFeatureSpecification", name, value: true })),
    aggregateRating:
      s.trust.googleReviewCount > 0
        ? { "@type": "AggregateRating", ratingValue: s.trust.googleRating, reviewCount: s.trust.googleReviewCount, bestRating: 5 }
        : undefined,
  };
}
