import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Trésor",
  description:
    "Le budget partagé de la famille : argent de poche, vacances, avances, transports.",
  applicationName: "Trésor",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Trésor",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" className={`${inter.variable} h-full`}>
      <body className="min-h-full bg-white text-ink-900 font-sans">
        {children}
      </body>
    </html>
  );
}
