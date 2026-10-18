import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "localgif",
  description: "Turn a video into a GIF right in your browser. Nothing is uploaded.",
};

// "cover": the Convert bar extends under the iPhone home indicator (it pads itself with safe-area-inset)
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
