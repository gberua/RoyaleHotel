import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  // the PDF voucher reads its fonts from disk at runtime — ship them with the serverless functions
  outputFileTracingIncludes: { "/**": ["./src/fonts/pdf/**"] },
  // admin photo uploads go one file per request; 25 MB leaves room for big phone JPEG/HEIC originals
  experimental: { serverActions: { bodySizeLimit: "25mb" } },
  images: {
    formats: ["image/avif", "image/webp"],
    deviceSizes: [480, 640, 828, 1080, 1280, 1600, 1920, 2560],
    imageSizes: [96, 160, 256, 384],
    localPatterns: [{ pathname: "/media/**" }, { pathname: "/images/**" }],
    // Vercel Blob (STORAGE_DRIVER=blob)
    remotePatterns: [{ protocol: "https", hostname: "*.public.blob.vercel-storage.com", pathname: "/media/**" }],
    minimumCacheTTL: 60 * 60 * 24 * 30,
  },
  turbopack: {
    rules: {
      "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" },
    },
  },
  // the suite's address before the hotel name was corrected to "Royal Palace"
  async redirects() {
    return [
      { source: "/rooms/royale-suite", destination: "/rooms/royal-suite", permanent: true },
      { source: "/:locale(ka|en|ru)/rooms/royale-suite", destination: "/:locale/rooms/royal-suite", permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
