"use client";

import Link from "next/link";
import { useSiteSettings } from "@/lib/useSiteSettings";
import styles from "./Header.module.css";

interface HeaderProps {
  logoIcon?: string;
  logoText?: string;
  logoAccent?: string;
  logoImage?: string;
}

export default function Header({ logoIcon, logoText, logoAccent, logoImage }: HeaderProps) {
  const settings = useSiteSettings();
  const icon = logoIcon || settings.logo_icon || "H";
  const text = logoText || settings.logo_text || "hl";
  const accent = logoAccent || settings.logo_accent || "mobile";
  const image = logoImage || settings.logo_image || "";

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link href="/" className={styles.logo}>
          {image ? (
            <img src={image} alt="logo" style={{ height: 32, objectFit: "contain" }} />
          ) : (
            <>
              <span className={styles.logoIcon}>{icon}</span>
              {text}<span className={styles.logoAccent}>{accent}</span>
            </>
          )}
        </Link>
        <nav className={styles.nav}>
          <Link href="/#carriers" className={styles.navLink}>통신사</Link>
          <Link href="/resources" className={styles.navLink}>자료실</Link>
          <Link href="/notices" className={styles.navLink}>공지사항</Link>
          <Link href="/inquiry" className={styles.navLink}>문의</Link>
          <Link href="/form" className={styles.ctaButton}>신청서 작성하기</Link>
        </nav>
      </div>
    </header>
  );
}
