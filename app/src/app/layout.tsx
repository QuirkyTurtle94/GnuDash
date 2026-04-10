import type { Metadata } from "next";
import { DM_Sans, Inter } from "next/font/google";
import "./globals.css";
import { DashboardProvider } from "@/lib/dashboard-context";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["cyrillic", "cyrillic-ext", "latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "GnuDash",
  description: "Personal finance dashboard for GNUCash",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${dmSans.variable} ${inter.variable} h-full antialiased`}>
      <body className="min-h-full" style={{ fontFamily: "var(--font-dm-sans), var(--font-inter), system-ui, sans-serif" }}>
        <DashboardProvider>{children}</DashboardProvider>
      </body>
    </html>
  );
}
