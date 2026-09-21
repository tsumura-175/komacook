import type { Metadata } from "next";
import { LINE_Seed_JP } from "next/font/google";
import "./globals.css";

const lineSeed = LINE_Seed_JP({
  weight: ["400", "700", "800"],
  display: "swap",
  variable: "--font-line-seed",
  preload: false,
  fallback: ["Yu Gothic", "Hiragino Kaku Gothic ProN", "sans-serif"],
});

export const metadata: Metadata = {
  title: "こまクック｜いつもの味を、いつでも",
  description: "毎日のレシピを保存して、家族の人数に合わせて使える料理ノート",
  icons: {
    icon: [{ url: "/brand/komacook-poodle-chef.png", type: "image/png" }],
    shortcut: "/brand/komacook-poodle-chef.png",
    apple: [{ url: "/brand/komacook-poodle-chef.png", type: "image/png" }],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja" className={lineSeed.variable}>
      <body>{children}</body>
    </html>
  );
}
