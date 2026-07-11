import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500", "700", "800"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://thesylvester.ca"),
  title: "Sylvester Wong — AI Software Engineer",
  description:
    "I build production AI systems, developer tools, and practical methods that help teams use coding agents with better context, memory, workflows, testing, and review.",
  openGraph: {
    title: "Sylvester Wong — AI Software Engineer",
    description:
      "I build production AI systems, developer tools, and practical methods that help teams use coding agents with better context, memory, workflows, testing, and review.",
    url: "https://thesylvester.ca",
    siteName: "Sylvester Wong",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={jetbrainsMono.variable}>
      <body>{children}</body>
    </html>
  );
}
