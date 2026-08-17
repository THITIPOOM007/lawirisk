import type { Metadata } from "next";
import { Geist_Mono, Noto_Sans_Thai } from "next/font/google";
import "./globals.css";
import Navigation from "@/components/Navigation";

const notoSansThai = Noto_Sans_Thai({
  variable: "--font-noto-sans-thai",
  subsets: ["thai", "latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "EvidenceVerse | ศูนย์บัญชาการหลักฐานดิจิทัล",
    template: "%s | EvidenceVerse",
  },
  description: "ระบบช่วยจัดระเบียบ ตรวจทาน และเชื่อมโยงหลักฐานดิจิทัลที่ตรวจสอบย้อนกลับถึงต้นฉบับได้",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="th"
      data-scroll-behavior="smooth"
      className={`${notoSansThai.variable} ${geistMono.variable} h-full antialiased dark`}
    >
      <body className="min-h-full bg-slate-950 text-slate-100">
        <Navigation>{children}</Navigation>
      </body>
    </html>
  );
}
