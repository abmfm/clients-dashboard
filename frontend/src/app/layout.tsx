import type { Metadata } from "next";

import { I18nProvider } from "@/lib/i18n/provider";
import { ThemeProvider, THEME_STORAGE_KEY } from "@/lib/theme/provider";
import "./globals.css";

export const metadata: Metadata = {
  // Resolves the relative image paths below; without it Next warns on every build.
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ??
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
  ),
  title: "Twelve East — Photography Studio",
  description:
    "Manage photography sessions, bookings and client requests from enquiry to delivery.",
  icons: {
    icon: "/icon.png",
    apple: "/apple-icon.png",
  },
  openGraph: {
    title: "Twelve East",
    description: "Photography studio management.",
    images: ["/logo.png"],
  },
};

/**
 * Runs before the first paint so a dark-mode user never sees a white flash
 * while React hydrates.
 */
const noFlash = `
(function () {
  try {
    var stored = localStorage.getItem('${THEME_STORAGE_KEY}');
    var dark = stored === 'dark' ||
      ((!stored || stored === 'system') &&
        window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (dark) document.documentElement.classList.add('dark');
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: noFlash }} />
      </head>
      <body>
        <ThemeProvider>
          <I18nProvider>{children}</I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
