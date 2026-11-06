"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Keeps admin lists live: new website bookings appear without reloading. */
export function AutoRefresh({ seconds = 30 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => document.visibilityState === "visible" && router.refresh(), seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}
