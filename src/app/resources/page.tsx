"use client";

import { useState, useEffect } from "react";
import Header from "@/components/Header";
import { fetchResources, type Resource } from "@/lib/api";

export default function ResourcesPage() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCarrier, setActiveCarrier] = useState<string | null>(null);

  useEffect(() => {
    fetchResources().then(setResources).catch(() => {}).finally(() => setLoading(false));
  }, []);

  // Group by carrier
  const carriers = new Map<string, { name: string; icon: string; items: Resource[] }>();
  for (const r of resources) {
    if (!carriers.has(r.carrier_id)) {
      carriers.set(r.carrier_id, { name: r.carrier_name || r.carrier_id, icon: r.carrier_icon || "", items: [] });
    }
    carriers.get(r.carrier_id)!.items.push(r);
  }

  const carrierList = Array.from(carriers.entries());
  const isImg = (s: string) => s && (s.startsWith("http") || s.startsWith("/"));

  return (
    <>
      <Header />
      <div style={{ paddingTop: "var(--header-height)", minHeight: "100vh", background: "var(--surface-1)" }}>
        <div style={{ maxWidth: 960, margin: "0 auto", padding: "32px 20px 80px" }}>
          <h1 style={{ fontSize: 24, fontWeight: 900, color: "var(--text-0)", marginBottom: 8 }}>자료실</h1>
          <p style={{ fontSize: 14, color: "var(--text-3)", marginBottom: 28 }}>통신사별 가입신청서, 변경신청서, 해지신청서 등을 다운로드하세요.</p>

          {loading ? (
            <p style={{ color: "var(--text-3)", textAlign: "center", padding: 40 }}>불러오는 중...</p>
          ) : carrierList.length === 0 ? (
            <p style={{ color: "var(--text-3)", textAlign: "center", padding: 40 }}>등록된 자료가 없습니다.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Carrier filter tabs */}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  onClick={() => setActiveCarrier(null)}
                  style={{
                    padding: "8px 18px", borderRadius: 99, fontSize: 13, fontWeight: 700, cursor: "pointer",
                    background: !activeCarrier ? "var(--brand)" : "white",
                    color: !activeCarrier ? "white" : "var(--text-2)",
                    border: !activeCarrier ? "none" : "1px solid var(--border)",
                  }}
                >전체</button>
                {carrierList.map(([id, c]) => (
                  <button
                    key={id}
                    onClick={() => setActiveCarrier(id)}
                    style={{
                      padding: "8px 18px", borderRadius: 99, fontSize: 13, fontWeight: 700, cursor: "pointer",
                      display: "flex", alignItems: "center", gap: 6,
                      background: activeCarrier === id ? "var(--brand)" : "white",
                      color: activeCarrier === id ? "white" : "var(--text-2)",
                      border: activeCarrier === id ? "none" : "1px solid var(--border)",
                    }}
                  >
                    {isImg(c.icon) && <img src={c.icon} alt="" style={{ width: 18, height: 18, objectFit: "contain", borderRadius: 4 }} />}
                    {c.name}
                  </button>
                ))}
              </div>

              {/* Resource list */}
              {carrierList
                .filter(([id]) => !activeCarrier || id === activeCarrier)
                .map(([id, c]) => (
                <div key={id} style={{ background: "white", borderRadius: 14, border: "1px solid var(--border)", overflow: "hidden" }}>
                  <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border-light)", display: "flex", alignItems: "center", gap: 10 }}>
                    {isImg(c.icon) && <img src={c.icon} alt="" style={{ width: 28, height: 28, objectFit: "contain", borderRadius: 6 }} />}
                    <span style={{ fontSize: 16, fontWeight: 800, color: "var(--text-0)" }}>{c.name}</span>
                    <span style={{ fontSize: 12, color: "var(--text-3)", fontWeight: 500 }}>{c.items.length}개 파일</span>
                  </div>
                  {c.items.map((r, i) => (
                    <a
                      key={r.id}
                      href={r.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        padding: "14px 20px", textDecoration: "none",
                        borderBottom: i < c.items.length - 1 ? "1px solid var(--border-light)" : "none",
                        transition: "background 0.15s",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "#F8FAFC")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <span style={{ fontSize: 20 }}>📄</span>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-0)" }}>{r.title}</div>
                          <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>
                            <span style={{ background: "var(--brand-light)", color: "var(--brand)", padding: "1px 8px", borderRadius: 99, fontWeight: 600, fontSize: 11 }}>{r.category}</span>
                            {r.file_name && <span style={{ marginLeft: 8 }}>{r.file_name}</span>}
                          </div>
                        </div>
                      </div>
                      <span style={{ fontSize: 13, color: "var(--brand)", fontWeight: 600, whiteSpace: "nowrap" }}>다운로드 →</span>
                    </a>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
