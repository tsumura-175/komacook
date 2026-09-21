import type { Metadata } from "next";
import { config } from "@fortawesome/fontawesome-svg-core";
import "@fortawesome/fontawesome-svg-core/styles.css";
import { M_PLUS_1p } from "next/font/google";
import "./globals.css";

// Font AwesomeのスタイルをサーバーHTMLと同時に読み込む。クライアント側の
// 自動注入を止めることで、初回描画時にSVGアイコンだけが一瞬未整形になるのを防ぐ。
config.autoAddCss = false;

const mPlus1p = M_PLUS_1p({
  weight: ["400", "500", "700", "800"],
  display: "swap",
  variable: "--font-m-plus-1p",
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
    <html lang="ja" className={mPlus1p.variable} data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}
