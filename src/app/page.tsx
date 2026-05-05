"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import { fetchCarrierTree, fetchNotices } from "@/lib/api";
import { useSiteSettings } from "@/lib/useSiteSettings";
import type { Carrier, Notice } from "@/types";
import styles from "./page.module.css";

export default function Home() {
  const [tree, setTree] = useState<Carrier[]>([]);
  const [carriersLoading, setCarriersLoading] = useState(true);
  const [activeMno, setActiveMno] = useState("");
  const [notices, setNotices] = useState<Notice[]>([]);
  const siteSettings = useSiteSettings();

  useEffect(() => {
    fetchCarrierTree()
      .then((data) => { setTree(data); if (data.length > 0) setActiveMno(data[0].id); })
      .catch(() => {})
      .finally(() => setCarriersLoading(false));
    fetchNotices().then((data) => setNotices(data.slice(0, 5))).catch(() => {});
  }, []);

  const activeMnoData = tree.find((m) => m.id === activeMno);
  const mvnoList = (activeMnoData?.children || []).filter(c => c.is_active);

  const isImg = (s: string) => s && (s.startsWith("http") || s.startsWith("/"));

  return (
    <>
      <Header />

      {/* Hero */}
      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <div className={styles.heroContent}>
            <div className={styles.heroBadge}>
              <span className={styles.heroBadgeDot} />
              모든 통신사 양식 지원
            </div>
            <h1 className={styles.heroTitle}>
              모든 통신사 신청서
              <br />
              <span className={styles.heroHighlight}>무료 작성 & 출력</span>
            </h1>
            <p className={styles.heroDesc}>
              SKT, KT, LG U+부터 알뜰폰까지.
              <br />
              가입·해지·번호이동 신청서를 간편하게 작성하고 바로 출력하세요.
            </p>
            <div className={styles.heroCTA}>
              <Link href="/form" className={styles.btnPrimary}>
                신청서 작성하기
              </Link>
              <Link href="/inquiry" className={styles.btnSecondary}>
                문의하기
              </Link>
            </div>
          </div>

          <div className={styles.heroVisual}>
            <div className={styles.phoneCard}>
              <div className={styles.phoneCardHeader}>
                <div className={styles.phoneCardAvatar}>📋</div>
                <div className={styles.phoneCardInfo}>
                  <h4>가입 신청서</h4>
                  <p>SKT · 번호이동</p>
                </div>
              </div>
              <div className={styles.phoneCardBody}>
                <div className={styles.quoteRow}>
                  <span className={styles.quoteLabel}>신청 유형</span>
                  <span className={styles.quoteValue}>번호이동</span>
                </div>
                <div className={styles.quoteRow}>
                  <span className={styles.quoteLabel}>요금제</span>
                  <span className={styles.quoteValue}>5G 다이렉트 59</span>
                </div>
                <div className={styles.quoteRow}>
                  <span className={styles.quoteLabel}>단말기</span>
                  <span className={styles.quoteValue}>갤럭시 S25</span>
                </div>
                <div className={styles.quoteRow}>
                  <span className={styles.quoteLabel}>비용</span>
                  <span className={`${styles.quoteValue} ${styles.quotePrice}`}>무료</span>
                </div>
              </div>
              <div className={styles.phoneCardFooter}>🖨️ 출력 준비 완료</div>
            </div>
          </div>
        </div>
      </section>

      {/* Carriers — 탭 스타일 */}
      <section id="carriers" className={styles.services}>
        <div className={styles.servicesInner}>
          <span className={styles.sectionTag}>통신사</span>
          <h2 className={styles.sectionTitle}>어떤 통신사 신청서가 필요하세요?</h2>

          {carriersLoading ? (
            <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
              {[1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ width: 120, height: 48, borderRadius: 12 }} />)}
            </div>
          ) : (
            <>
              {/* 대분류 탭 */}
              <div className={styles.mnoTabs}>
                {tree.map((mno) => (
                  <button
                    key={mno.id}
                    className={`${styles.mnoTab} ${activeMno === mno.id ? styles.mnoTabActive : ""}`}
                    onClick={() => setActiveMno(mno.id)}
                  >
                    <span className={styles.mnoTabIcon}>
                      {isImg(mno.icon) ? <img src={mno.icon} alt={mno.title} style={{ width: 22, height: 22, objectFit: "contain" }} /> : mno.icon}
                    </span>
                    <span>{mno.title}</span>
                    <span className={styles.mnoTabCount}>{mno.children?.length || 0}</span>
                  </button>
                ))}
              </div>

              {/* 알뜰폰 그리드 — 이미지만 */}
              <div className={styles.mvnoGrid}>
                {mvnoList.length === 0 ? (
                  <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: 40, color: "var(--text-3)" }}>등록된 알뜰폰이 없습니다.</div>
                ) : (
                  mvnoList.map((c, ci) => {
                    const hasLink = c.forms?.startsWith("http");
                    return hasLink ? (
                      <a key={c.id} href={c.forms} target="_blank" rel="noopener noreferrer" className={`${styles.mvnoCard} fadeIn`} style={{ animationDelay: `${ci * 0.04}s`, textDecoration: "none" }}>
                        {isImg(c.icon) ? (
                          <img src={c.icon} alt={c.title} className={styles.mvnoImg} />
                        ) : (
                          <span className={styles.mvnoEmoji}>{c.icon}</span>
                        )}
                      </a>
                    ) : (
                      <Link key={c.id} href={`/form?carrier=${encodeURIComponent(c.id)}`} className={`${styles.mvnoCard} fadeIn`} style={{ animationDelay: `${ci * 0.04}s` }}>
                        {isImg(c.icon) ? (
                          <img src={c.icon} alt={c.title} className={styles.mvnoImg} />
                        ) : (
                          <span className={styles.mvnoEmoji}>{c.icon}</span>
                        )}
                      </Link>
                    );
                  })
                )}
              </div>
            </>
          )}
        </div>
      </section>

      {/* 공지사항 + 문의하기 */}
      <section className={styles.infoSection}>
        <div className={styles.infoInner}>
          {/* 공지사항 */}
          <div className={styles.infoCard}>
            <div className={styles.infoCardHeader}>
              <h3 className={styles.infoCardTitle}>📢 공지사항</h3>
              <Link href="/notices" className={styles.infoCardMore}>전체보기 →</Link>
            </div>
            <div className={styles.noticeList}>
              {notices.length === 0 ? (
                <div className={styles.noticeEmpty}>등록된 공지가 없습니다.</div>
              ) : (
                notices.map((n) => (
                  <Link href={`/notices?id=${n.id}`} key={n.id} className={styles.noticeItem}>
                    <div className={styles.noticeItemLeft}>
                      {n.is_pinned ? <span className={styles.noticePinBadge}>공지</span> : null}
                      <span className={styles.noticeItemTitle}>{n.title}</span>
                    </div>
                    <span className={styles.noticeItemDate}>{n.created_at?.slice(0, 10)}</span>
                  </Link>
                ))
              )}
            </div>
          </div>

          {/* 문의하기 */}
          <div className={styles.infoCard}>
            <div className={styles.infoCardHeader}>
              <h3 className={styles.infoCardTitle}>💬 문의하기</h3>
            </div>
            <div className={styles.inquiryBox}>
              <p className={styles.inquiryDesc}>
                궁금한 점이나 양식 요청 등<br />
                무엇이든 편하게 문의해주세요.
              </p>
              <Link href="/inquiry" className={styles.inquiryBtn}>문의 등록하기 →</Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div className={styles.footerBrand}>
            <div className={styles.footerLogo}>
              {siteSettings.logo_image ? (
                <img src={siteSettings.logo_image} alt="logo" style={{ height: 26, objectFit: "contain" }} />
              ) : (
                <>
                  <span className={styles.footerLogoIcon}>{siteSettings.logo_icon || "H"}</span>
                  {(siteSettings.logo_text || "hl") + (siteSettings.logo_accent || "mobile")}
                </>
              )}
            </div>
            <p className={styles.footerDesc}>
              {siteSettings.footer_desc || "모든 통신사 신청서를 무료로 작성하고 출력하세요. 가입, 해지, 번호이동 양식을 한 곳에서."}
            </p>
          </div>
          <div className={styles.footerLinks}>
            <div className={styles.footerCol}>
              <h4>서비스</h4>
              <ul>
                <li><a href="#carriers">통신사 목록</a></li>
                <li><a href="/form">신청서 작성</a></li>
              </ul>
            </div>
            <div className={styles.footerCol}>
              <h4>고객지원</h4>
              <ul>
                <li><Link href="/notices">공지사항</Link></li>
                <li><Link href="/inquiry">문의하기</Link></li>
              </ul>
            </div>
            <div className={styles.footerCol}>
              <h4>안내</h4>
              <ul>
                <li><a href="#">이용약관</a></li>
                <li><a href="#">개인정보처리방침</a></li>
              </ul>
            </div>
          </div>
        </div>
        <div style={{ padding: "16px 24px", fontSize: 11, color: "var(--text-3)", lineHeight: 1.8, borderTop: "1px solid var(--border-light)", marginTop: 16 }}>
          사업자: {siteSettings.company_name || "주식회사 에치엘그룹"} | 대표자: {siteSettings.company_ceo || "왕산루"} | 사업자등록번호: {siteSettings.business_number || "143-86-02556"}<br />
          주소: {siteSettings.address || "인천광역시 미추홀구 인하로77번길 27 3층"} | 통신판매번호: {siteSettings.commerce_number || "제 2025-인천연수구-1032호"}
        </div>
        <div className={styles.footerBottom}>
          {siteSettings.copyright || "© 2026 hlmobile. All rights reserved."}
          <Link href="/admin" style={{ marginLeft: 16, color: "var(--text-3)", fontSize: 12 }}>관리자</Link>
        </div>
      </footer>
    </>
  );
}
