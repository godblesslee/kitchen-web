import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "创意厨房预约",
  description: "数字游民社区公共厨房设备预约系统",
};

export default function RootLayout({
  children,
}: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
      </head>
      <body>{children}</body>
    </html>
  );
}
