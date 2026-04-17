import type { Metadata } from "next";
import { DM_Sans, Inter } from "next/font/google";
import "./globals.css";
import { DashboardProvider } from "@/lib/dashboard-context";
import { ThemeProvider } from "@/lib/theme-context";

// Runs before hydration to set the `.dark` class on <html> based on the
// persisted preference (or OS setting when no preference is stored), avoiding
// a flash of the wrong theme on first paint.
const themeInitScript = `
(function() {
  try {
    var stored = localStorage.getItem('gnudash-theme');
    var dark = stored === 'dark' ||
      ((!stored || stored === 'system') &&
       window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (dark) document.documentElement.classList.add('dark');
  } catch (e) {}
})();
`;

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
    <html
      lang="en"
      className={`${dmSans.variable} ${inter.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full" style={{ fontFamily: "var(--font-dm-sans), var(--font-inter), system-ui, sans-serif" }}>
        <ThemeProvider>
          <DashboardProvider>{children}</DashboardProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
