"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";
import { API_BASE, DEMO_DEPLOY, IS_MOCK } from "@/lib/api";
import { cx } from "./ui";
import { RECORDING_MODE } from "@/lib/demo";

export function Header() {
  const path = usePathname();
  const nav = [
    { href: "/", label: "Cases", active: path === "/" || path.startsWith("/cases") },
    { href: "/audit", label: "Audit log", active: path.startsWith("/audit") },
  ];
  return (
    <header className="sticky top-0 z-20 border-b border-zinc-200/80 bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-6">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-zinc-900 text-[11px] font-bold tracking-tight text-white">GSD</span>
          <span className="text-sm font-semibold tracking-tight text-zinc-900">Claims Agent</span>
          <span className="hidden text-sm text-zinc-400 sm:inline">· powered by Fo</span>
        </Link>
        <nav className="flex items-center gap-1">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} className={cx("rounded-md px-2.5 py-1.5 text-sm transition",
              n.active ? "bg-zinc-100 font-medium text-zinc-900" : "text-zinc-500 hover:text-zinc-900")}>{n.label}</Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          {IS_MOCK && (
            <span title={DEMO_DEPLOY ? "Public demo: all data is simulated in this app. Nothing reaches a real agent." : "Data is served by the in-app mock layer. Set NEXT_PUBLIC_API_BASE to use the real backend."}
              className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 font-mono text-[11px] font-semibold tracking-wider text-amber-800">{DEMO_DEPLOY ? "DEMO DATA" : "MOCK DATA"}</span>
          )}
          {!IS_MOCK && !RECORDING_MODE && (
            <span title="Connected to the real backend" className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2 py-1 font-mono text-[11px] text-zinc-600">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />API {API_BASE.replace(/^https?:\/\//, "")}
            </span>
          )}
          <Link href="/new" className={cx("inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium shadow-sm transition",
            path === "/new" ? "bg-accent-700 text-white" : "bg-accent-600 text-white hover:bg-accent-700")}>
            <Plus className="h-4 w-4" /> New claim
          </Link>
        </div>
      </div>
      {DEMO_DEPLOY && (
        <div className="border-t border-amber-200 bg-amber-50 px-6 py-1.5 text-center text-xs text-amber-900">
          Demo data only. This page is not connected to a real agent: approving or rejecting changes simulated cases here, and no email, call or payment is ever made.
        </div>
      )}
    </header>
  );
}
