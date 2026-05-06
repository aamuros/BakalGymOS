import type { Metadata } from "next";
import { Fraunces, Nunito_Sans } from "next/font/google";

import "./globals.css";

const heading = Fraunces({
  subsets: ["latin"],
  variable: "--font-heading",
});

const body = Nunito_Sans({
  subsets: ["latin"],
  variable: "--font-body",
});

export const metadata: Metadata = {
  title: "GymLedger",
  description: "Gym operations ledger for small local gyms.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${heading.variable} ${body.variable} font-[var(--font-body)] antialiased`}>
        {children}
      </body>
    </html>
  );
}
