import type { Metadata } from "next";
import { Inter, Cormorant_Garamond } from "next/font/google";
import { AuthProvider } from "@/lib/auth";
import { I18nProvider } from "@/lib/i18n";
import "./globals.css";

/* REBRAND: pending — replace when final typeface is licensed */
const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  variable: "--font-inter",
});

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-cormorant",
});

export const metadata: Metadata = {
  title: "Tellian Capital — Kundenportal",
  description: "Dokumentenzugang fuer Kunden von Tellian Capital AG",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de" className={`${inter.variable} ${cormorant.variable} h-full`}>
      <body
        className="min-h-full flex flex-col"
        style={{ fontFamily: "var(--font-inter), 'Inter', sans-serif" }}
      >
        <I18nProvider><AuthProvider>{children}</AuthProvider></I18nProvider>
      </body>
    </html>
  );
}
