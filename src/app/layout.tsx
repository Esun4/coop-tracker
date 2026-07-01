import type { Metadata } from "next";
import localFont from "next/font/local";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

// Self-hosted variable fonts (latin subset) so dev/build never fetches from
// Google at compile time. Source files live in src/fonts/.
const playfair = localFont({
  variable: "--font-playfair",
  src: "../fonts/PlayfairDisplay-latin.woff2",
  weight: "400 700",
  display: "swap",
});

const dmSans = localFont({
  variable: "--font-dm-sans",
  src: "../fonts/DMSans-latin.woff2",
  weight: "300 600",
  display: "swap",
});

const jetbrainsMono = localFont({
  variable: "--font-jetbrains-mono",
  src: "../fonts/JetBrainsMono-latin.woff2",
  weight: "400 500",
  display: "swap",
});

export const metadata: Metadata = {
  title: "cooptracker — Job Application Tracker",
  description: "Track your co-op and internship applications",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${playfair.variable} ${dmSans.variable} ${jetbrainsMono.variable} h-full`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col antialiased">
        <ThemeProvider>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
