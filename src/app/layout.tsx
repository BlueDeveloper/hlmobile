import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Providers from "@/components/Providers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_URL = "https://hlmobile-1ue.pages.dev";
const SITE_NAME = "hlmobile";
const SITE_DESCRIPTION =
  "hlmobile — 모든 통신사 가입신청서를 무료로 작성하고 출력하세요. SKT, KT, LG U+, 알뜰폰 신규가입·번호이동·기기변경·해지 양식을 한 곳에서.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — 모든 통신사 신청서 무료 출력`,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  keywords: [
    "hlmobile",
    "통신사 신청서",
    "가입신청서",
    "번호이동 신청서",
    "알뜰폰 신청서",
    "SKT 가입",
    "KT 가입",
    "LG U+ 가입",
    "신청서 출력",
    "신청서 무료",
    "통신사 양식",
    "바로폼",
  ],
  authors: [{ name: SITE_NAME }],
  creator: SITE_NAME,
  openGraph: {
    type: "website",
    locale: "ko_KR",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: `${SITE_NAME} — 모든 통신사 신청서 무료 출력`,
    description: SITE_DESCRIPTION,
    images: [
      {
        url: `${SITE_URL}/og-image.svg`,
        width: 1200,
        height: 630,
        alt: "hlmobile — 모든 통신사 신청서 무료 출력",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — 모든 통신사 신청서 무료 출력`,
    description: SITE_DESCRIPTION,
    images: [`${SITE_URL}/og-image.svg`],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  alternates: {
    canonical: SITE_URL,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: SITE_NAME,
    url: SITE_URL,
    logo: `${SITE_URL}/og-image.svg`,
    image: `${SITE_URL}/og-image.svg`,
    description: SITE_DESCRIPTION,
    applicationCategory: "UtilitiesApplication",
    operatingSystem: "Web",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "KRW",
    },
    areaServed: {
      "@type": "Country",
      name: "대한민국",
    },
    featureList: [
      "모든 통신사 가입신청서 지원",
      "신규가입, 번호이동, 기기변경, 해지 양식",
      "완전 무료 서비스",
      "즉시 PDF 출력",
      "모바일 반응형 지원",
    ],
  };

  return (
    <html lang="ko" className={`${geistSans.variable} ${geistMono.variable}`}>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body><Providers>{children}</Providers></body>
    </html>
  );
}
