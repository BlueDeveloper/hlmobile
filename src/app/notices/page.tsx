"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Header from "@/components/Header";
import { fetchNotices } from "@/lib/api";
import type { Notice } from "@/types";
import styles from "../page.module.css";

function NoticesContent() {
  const searchParams = useSearchParams();
  const targetId = searchParams.get("id");
  const [notices, setNotices] = useState<Notice[]>([]);
  const [selected, setSelected] = useState<Notice | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchNotices().then((data) => {
      setNotices(data);
      if (targetId) {
        const target = data.find((n) => String(n.id) === targetId);
        if (target) setSelected(target);
      }
    }).catch(() => {}).finally(() => setLoading(false));
  }, [targetId]);

  return (
    <div style={{ paddingTop: "var(--header-height)", minHeight: "100vh", background: "var(--surface-1)" }}>
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "32px 20px 80px" }}>
        <h1 style={{ fontSize: 24, fontWeight: 900, color: "var(--text-0)", marginBottom: 24 }}>공지사항</h1>

        {loading ? (
          <p style={{ color: "var(--text-3)", textAlign: "center", padding: 40 }}>불러오는 중...</p>
        ) : notices.length === 0 ? (
          <p style={{ color: "var(--text-3)", textAlign: "center", padding: 40 }}>공지사항이 없습니다.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 0, background: "white", borderRadius: 14, border: "1px solid var(--border)", overflow: "hidden" }}>
            {notices.map((n, i) => (
              <div key={n.id} id={`notice-${n.id}`} onClick={() => setSelected(selected?.id === n.id ? null : n)} style={{ padding: "16px 20px", borderBottom: i < notices.length - 1 ? "1px solid var(--border-light)" : "none", cursor: "pointer", transition: "background 0.15s" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  {n.is_pinned ? <span style={{ fontSize: 12, background: "var(--brand-light)", color: "var(--brand)", padding: "2px 8px", borderRadius: 99, fontWeight: 700 }}>공지</span> : null}
                  <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text-0)" }}>{n.title}</span>
                </div>
                <div style={{ fontSize: 12, color: "var(--text-3)" }}>{n.created_at?.slice(0, 10)}</div>
                {selected?.id === n.id && (
                  <>
                    <div
                      style={{ marginTop: 12, padding: "14px 0 4px", borderTop: "1px solid var(--border-light)", fontSize: 14, color: "var(--text-1)", lineHeight: 1.7 }}
                      dangerouslySetInnerHTML={{ __html: n.content }}
                    />
                    {n.attachments && (() => { try { const files = JSON.parse(n.attachments) as string[]; return files.length > 0 ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                        {files.map((url, i) => (
                          <a key={i} href={url} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "#F8FAFC", borderRadius: 8, border: "1px solid #E8ECF1", textDecoration: "none" }}>
                            {url.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                              <img src={url} alt="" style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 4 }} />
                            ) : (
                              <span style={{ fontSize: 20 }}>📎</span>
                            )}
                            <span style={{ fontSize: 12, color: "var(--brand)", fontWeight: 600 }}>{url.split("/").pop()}</span>
                          </a>
                        ))}
                      </div>
                    ) : null; } catch { return null; } })()}
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function NoticesPage() {
  return (
    <>
      <Header />
      <Suspense fallback={<div style={{ paddingTop: "var(--header-height)", textAlign: "center", padding: 40, color: "var(--text-3)" }}>불러오는 중...</div>}>
        <NoticesContent />
      </Suspense>
    </>
  );
}
