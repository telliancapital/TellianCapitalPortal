import type { Metadata } from "next";
import localFont from "next/font/local";
import { AuthProvider } from "@/lib/auth";
import { I18nProvider } from "@/lib/i18n";
import "./globals.css";

const inter = localFont({
  src: [
    { path: "./fonts/Inter-VariableFont_opsz,wght.ttf", weight: "100 900", style: "normal" },
    { path: "./fonts/Inter-Italic-VariableFont_opsz,wght.ttf", weight: "100 900", style: "italic" },
  ],
  variable: "--font-inter",
});

const lustria = localFont({
  src: "./fonts/Lustria-Regular.ttf",
  weight: "400",
  style: "normal",
  variable: "--font-lustria",
});

export const metadata: Metadata = {
  title: "Tellian Capital — Portal",
  description: "Dokumentenzugang fuer Kunden von Tellian Capital AG",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de" className={`${inter.variable} ${lustria.variable} h-full`}>
      <body
        className="min-h-full flex flex-col"
        style={{ fontFamily: "var(--font-inter), 'Inter', sans-serif" }}
      >
        <I18nProvider><AuthProvider>{children}</AuthProvider></I18nProvider>
      </body>
    </html>
  );
}
