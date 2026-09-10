import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ServiceWorker } from "@/components/pwa/service-worker";
import { configWarnings } from "@/lib/env";
import { ToastHost } from "@/components/ui/toast";

export const metadata: Metadata = {
  title: { default: "keys — Passwords", template: "%s · keys" },
  description:
    "No master password. Just your inbox and your fingerprint. Encrypted on your device with a key we never see.",
  applicationName: "keys",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "keys",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/icons/favicon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  formatDetection: { telephone: false, address: false, email: false },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#faf9f7",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

for (const warning of configWarnings()) {
  console.warn(`keys · config · ${warning}`);
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {children}
        <ToastHost />
        <ServiceWorker />
      </body>
    </html>
  );
}
