import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PACE Platform",
  description: "Athletic performance and injury management platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
