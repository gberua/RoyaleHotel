import type { Metadata } from "next";
import "../globals.css";
import { fontVariables } from "@/config/fonts";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · Royal Palace Admin" },
  robots: { index: false, follow: false },
};

/** Separate root layout for the staff area (English UI for now; KA/RU admin labels come in phase c). */
export default function AdminRootLayout({ children }: LayoutProps<"/admin">) {
  return (
    <html lang="en" className={fontVariables}>
      <body className="min-h-svh bg-mist">{children}</body>
    </html>
  );
}
