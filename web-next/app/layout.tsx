import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-display",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-mono",
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "dark light",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#090D0B" },
    { media: "(prefers-color-scheme: light)", color: "#F4F3EE" },
  ],
};

export const metadata: Metadata = {
  title: "PitchOracle AI — Football Match Forecaster & Score Predictor",
  description:
    "Hybrid ML Ensemble (XGBoost + Random Forest + Dixon-Coles 10,000x Monte Carlo) tactical broadcast forecaster across Premier League, La Liga, Bundesliga, Serie A, Ligue 1 & Champions League.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable}`}
    >
      <body>
        <a href="#main-workspace" className="skip-link">
          Skip to main forecast workspace
        </a>
        {children}
      </body>
    </html>
  );
}
