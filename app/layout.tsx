import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CFSP",
  description: "Conflict-Free SP operations for simulation event coverage, assignments, and staffing workflows.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var theme = localStorage.getItem("cfsp-theme");
                if (theme === "dark") {
                  document.documentElement.setAttribute("data-theme", "dark");
                } else {
                  document.documentElement.setAttribute("data-theme", "light");
                }
              } catch (error) {
                document.documentElement.setAttribute("data-theme", "light");
              }
            `,
          }}
        />
        {children}
      </body>
    </html>
  );
}
