import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { ToastProvider } from "@/components/ToastProvider";
import "./globals.css";

const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://api.jzuv.my.id"),
  title: {
    default: "JzREST API",
    template: "%s | JzREST API",
  },
  description: "High-performance API platform for modern apps with secure authentication and dashboard controls.",
  icons: {
    icon: "/icon.png",
    apple: "/apple-icon.png",
    shortcut: "/icon.png",
  },
  openGraph: {
    title: "JzREST API",
    description: "High-performance API platform for modern apps with secure authentication and dashboard controls.",
    images: ["/opengraph-image"],
  },
  twitter: {
    card: "summary_large_image",
    title: "JzREST API",
    description: "High-performance API platform for modern apps with secure authentication and dashboard controls.",
    images: ["/twitter-image"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" data-theme="dark" style={{ colorScheme: "dark" }}>
      <body className={`${geist.variable} min-h-screen antialiased transition-colors duration-300`}>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
