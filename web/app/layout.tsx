import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Header } from "@/components/Header";
import "./globals.css";

export const metadata: Metadata = { title: "GSD Claims Agent", description: "Files disputes and claims, follows up until resolved." };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="min-h-screen font-sans">
        <Header />
        <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
