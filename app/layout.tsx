import type { Metadata } from "next";
import { Exo_2, Press_Start_2P } from "next/font/google";
import "./globals.css";

const exo = Exo_2({
  variable: "--font-exo",
  subsets: ["latin"],
});

const arcade = Press_Start_2P({
  variable: "--font-arcade",
  weight: "400",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Chain Burst",
  description: "Instant-play shockwave arcade toy built with Next.js canvas.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${exo.variable} ${arcade.variable}`}>{children}</body>
    </html>
  );
}
