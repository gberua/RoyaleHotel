"use client";
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";

const BookingDrawer = dynamic(() => import("./BookingDrawer"), { ssr: false });

type Ctx = { openBooking: (opts?: { room?: string }) => void };
const DrawerContext = createContext<Ctx>({ openBooking: () => {} });
export const useBookingDrawer = () => useContext(DrawerContext);

/**
 * Global booking drawer. Loaded on first use (zero JS cost until a guest taps "Book"),
 * then kept mounted so dates and guests persist while browsing.
 */
export function BookingDrawerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ mounted: boolean; open: boolean; room: string | null }>({ mounted: false, open: false, room: null });
  const returnFocus = useRef<HTMLElement | null>(null);

  const openBooking = useCallback((opts?: { room?: string }) => {
    returnFocus.current = document.activeElement as HTMLElement | null;
    setState({ mounted: true, open: true, room: opts?.room ?? null });
  }, []);
  const close = useCallback(() => {
    setState((s) => ({ ...s, open: false }));
    returnFocus.current?.focus?.();
  }, []);

  return (
    <DrawerContext.Provider value={{ openBooking }}>
      {children}
      {state.mounted && <BookingDrawer open={state.open} preselect={state.room} onClose={close} />}
    </DrawerContext.Provider>
  );
}
