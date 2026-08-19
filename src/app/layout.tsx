import type { Metadata } from "next";
import "./globals.css";
import Navigation from "@/components/Navigation";

export const metadata: Metadata = {
  title: {
    default: "LawiRisk-SSK | ศูนย์บัญชาการหลักฐานดิจิทัล",
    template: "%s | LawiRisk-SSK",
  },
  description: "ระบบช่วยจัดระเบียบ ตรวจทาน และเชื่อมโยงหลักฐานดิจิทัลที่ตรวจสอบย้อนกลับถึงต้นฉบับได้",
  icons: {
    icon: "/lawirisk-ssk-mark-v2.png",
    apple: "/lawirisk-ssk-mark-v2.png",
  },
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
      className="h-full antialiased dark"
    >
      <body className="min-h-full bg-slate-950 text-slate-100">
        <Navigation>{children}</Navigation>
      </body>
    </html>
  );
}
