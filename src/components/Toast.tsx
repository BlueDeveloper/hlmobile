"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";

type ToastType = "success" | "error" | "info";

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextType {
  toast: (message: string, type?: ToastType) => void;
  showLoading: (message?: string) => void;
  hideLoading: () => void;
}

const ToastContext = createContext<ToastContextType>({ toast: () => {}, showLoading: () => {}, hideLoading: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

let toastId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [loadingMsg, setLoadingMsg] = useState<string | null>(null);

  const toast = useCallback((message: string, type: ToastType = "info") => {
    const id = ++toastId;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 2500);
  }, []);

  const showLoading = useCallback((message = "처리 중...") => {
    setLoadingMsg(message);
  }, []);

  const hideLoading = useCallback(() => {
    setLoadingMsg(null);
  }, []);

  const colors = {
    success: { bg: "#ECFDF5", border: "#A7F3D0", text: "#065F46", icon: "✓" },
    error: { bg: "#FEF2F2", border: "#FECACA", text: "#991B1B", icon: "✕" },
    info: { bg: "#EFF6FF", border: "#BFDBFE", text: "#1E40AF", icon: "ℹ" },
  };

  return (
    <ToastContext.Provider value={{ toast, showLoading, hideLoading }}>
      {children}

      {/* 전역 로딩 오버레이 */}
      {loadingMsg && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 99999,
          background: "rgba(255,255,255,0.85)", backdropFilter: "blur(4px)",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          gap: 16,
        }}>
          <div style={{
            width: 44, height: 44, border: "4px solid #E2E8F0", borderTopColor: "var(--brand)",
            borderRadius: "50%", animation: "spin 0.8s linear infinite",
          }} />
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-0)" }}>{loadingMsg}</div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* 토스트 */}
      <div style={{
        position: "fixed", bottom: 24, right: 24,
        zIndex: 100000, display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-end",
        pointerEvents: "none",
      }}>
        {toasts.map((t) => {
          const c = colors[t.type];
          return (
            <div key={t.id} style={{
              padding: "8px 16px", background: c.bg, border: `1px solid ${c.border}`,
              borderRadius: 8, fontSize: 12, fontWeight: 600, color: c.text,
              boxShadow: "0 4px 16px rgba(0,0,0,0.1)", display: "flex", alignItems: "center", gap: 6,
              animation: "fadeIn 0.2s ease-out",
              pointerEvents: "auto",
            }}>
              <span style={{ fontSize: 13, fontWeight: 800 }}>{c.icon}</span>
              {t.message}
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
