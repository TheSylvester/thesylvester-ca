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
    <html lang="en" className={jetbrainsMono.variable} suppressHydrationWarning>
      <body>
        {/* Set pre-paint so CSS can gate scroll-reveal hidden states on JS
            actually running — a synchronous script here blocks paint of
            everything below it. If JS is off or the bundle fails, html.js
            never exists and the page stays fully visible. */}
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
        {children}
      </body>
    </html>
  );
}
