export const metadata = { title: "PACE Print" };
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body style={{ background: "white", color: "#111", fontFamily: "sans-serif", padding: "2rem", maxWidth: "800px", margin: "0 auto" }}>
        {children}
      </body>
    </html>
  );
}
