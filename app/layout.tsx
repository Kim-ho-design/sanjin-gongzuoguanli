import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "三金打工清单",
  description: "计划—执行—记录—周报 闭环的个人工作管理系统",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
