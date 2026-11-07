/** Review sources and moderation statuses (mirror the Prisma enums). */
export const REVIEW_SOURCES = ["GOOGLE", "DIRECT", "BOOKING_COM", "OTHER"] as const;
export const REVIEW_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;
export type ReviewStatusName = (typeof REVIEW_STATUSES)[number];
