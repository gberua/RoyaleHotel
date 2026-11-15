"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3, BedDouble, CalendarDays, CalendarRange, ClipboardList, FileText, Gift, History, ImageIcon, LayoutDashboard, LogOut, Mail, Menu,
  Plus, RefreshCw, Settings, Sparkles, Star, Sun, Tag, User, Users, UserCog, X,
} from "lucide-react";

const ICONS = { BarChart3, BedDouble, CalendarDays, CalendarRange, ClipboardList, FileText, Gift, History, ImageIcon, LayoutDashboard, Mail, Plus, RefreshCw, Settings, Sparkles, Star, Sun, Tag, User, Users, UserCog };
export type NavGroup = { label: string; items: { href: string; label: string; icon: keyof typeof ICONS }[] };

export function AdminNav({ groups, user, accountLabel, logoutLabel, menuLabel, logout }: { groups: NavGroup[]; user: string; accountLabel: string; logoutLabel: string; menuLabel: string; logout: () => Promise<void> }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [last, setLast] = useState(pathname);
  if (last !== pathname) { setLast(pathname); setOpen(false); }
  useEffect(() => {
    document.documentElement.style.overflow = open ? "hidden" : "";
  }, [open]);
  const all = groups.flatMap((g) => g.items.map((i) => i.href));
  const active = all.filter((h) => pathname === h || (h !== "/admin" && pathname.startsWith(h + "/"))).sort((a, b) => b.length - a.length)[0] ?? (pathname === "/admin" ? "/admin" : "");

  const nav = (
    <nav className="space-y-5 text-sm" aria-label="Admin">
      {groups.map((g) => (
        <div key={g.label}>
          <p className="mb-1 px-3 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-ink-500">{g.label}</p>
          <ul className="space-y-0.5">
            {g.items.map(({ href, label, icon }) => {
              const I = ICONS[icon];
              return (
                <li key={href}>
                  <Link href={href} aria-current={active === href ? "page" : undefined} className={`flex items-center gap-2.5 rounded-lg px-3 py-2 font-medium ${active === href ? "bg-sea-50 text-sea-900" : "text-ink-700 hover:bg-mist"}`}>
                    <I size={16} aria-hidden /> {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      <div className="border-t border-ink-100 pt-3">
        <Link href="/admin/account" className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-ink-700 hover:bg-mist"><User size={16} aria-hidden /> {accountLabel} <span className="truncate text-xs text-ink-500">· {user}</span></Link>
        <form action={logout}><button className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-ink-700 hover:bg-mist"><LogOut size={16} aria-hidden /> {logoutLabel}</button></form>
      </div>
    </nav>
  );

  return (
    <>
      <aside className="fixed inset-y-0 left-0 hidden w-60 overflow-y-auto border-r border-ink-100 bg-white px-3 py-5 lg:block">
        <Link href="/admin" className="mb-6 block px-3 font-display text-lg tracking-[0.12em]">ROYAL PALACE <span className="font-sans text-xs tracking-normal text-ink-500">admin</span></Link>
        {nav}
      </aside>
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-ink-100 bg-white/95 px-4 py-2 backdrop-blur lg:hidden">
        <Link href="/admin" className="font-display text-xl tracking-[0.12em]">ROYAL PALACE</Link>
        <button type="button" onClick={() => setOpen(true)} className="flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold" aria-expanded={open}><Menu size={18} aria-hidden /> {menuLabel}</button>
      </div>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <button type="button" aria-label="Close" className="absolute inset-0 bg-ink-950/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-[85%] max-w-xs overflow-y-auto bg-white px-3 py-4">
            <button type="button" onClick={() => setOpen(false)} className="mb-3 ml-auto grid h-10 w-10 place-items-center rounded-full hover:bg-mist" aria-label="Close"><X size={20} /></button>
            {nav}
          </div>
        </div>
      )}
    </>
  );
}
