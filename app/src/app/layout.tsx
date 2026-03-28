import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";
import "./globals.css";
import { DashboardProvider } from "@/lib/dashboard-context";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
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
    <html lang="en" className={`${dmSans.variable} h-full antialiased`}>
      <body className="min-h-full" style={{ fontFamily: "var(--font-dm-sans), system-ui, sans-serif" }}>
        <DashboardProvider>{children}</DashboardProvider>
      </body>
    </html>
  );
}
