import type { Metadata } from "next";

import { I18nProvider } from "@/lib/i18n/provider";
import { ThemeProvider, THEME_STORAGE_KEY } from "@/lib/theme/provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Twelve East — Photography Studio",
  description:
    "Manage photography sessions, projects and client requests from booking to delivery.",
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
