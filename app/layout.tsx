import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "nobsvideo2gif",
  description: "Turn a video into a GIF right in your browser. Nothing is uploaded.",
};

// viewportFit "cover" lets the sticky Convert bar extend under the iPhone home indicator
// (it pads itself with env(safe-area-inset-bottom)). Zooming stays allowed (WCAG 1.4.4).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0d0b12",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <div aria-hidden="true" className="backdrop pointer-events-none fixed inset-0 -z-10" />
        {children}
      </body>
    </html>
  );
}
