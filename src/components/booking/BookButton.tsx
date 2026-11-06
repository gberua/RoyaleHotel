"use client";
import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { useBookingDrawer } from "./BookingDrawerProvider";

/**
 * Every "Book" call-to-action. Opens the booking drawer (optionally with a room preselected);
 * without JavaScript it is a normal link to the booking page.
 */
export function BookButton({ room, className = "btn btn-accent", children, ariaLabel }: { room?: string; className?: string; children: ReactNode; ariaLabel?: string }) {
  const { openBooking } = useBookingDrawer();
  return (
    <Link
      href={room ? `/book?room=${room}` : "/book"}
      prefetch={false}
      aria-label={ariaLabel}
      aria-haspopup="dialog"
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey) return;
        e.preventDefault();
        openBooking({ room });
      }}
      className={className}
    >
      {children}
    </Link>
  );
}
