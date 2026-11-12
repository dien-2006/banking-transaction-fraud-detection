import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./responsive.css";
import { Providers } from "@/components/providers";

export const metadata: Metadata = { title: "D4 Bank", description: "D4 Bank – Banking Simulation System" };
export const viewport: Viewport = { colorScheme: "light", width: "device-width", initialScale: 1, viewportFit: "cover" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="vi" className="light"><head><meta name="darkreader-lock" /></head><body><Providers>{children}</Providers></body></html>;
}
