"use client";

import { useState, useEffect } from "react";
import { fetchSettings } from "./api";

let cached: Record<string, string> | null = null;

export function useSiteSettings() {
  const [settings, setSettings] = useState<Record<string, string>>(cached || {});

  useEffect(() => {
    if (cached) { setSettings(cached); return; }
    fetchSettings().then((data) => { cached = data; setSettings(data); }).catch(() => {});
  }, []);

  return settings;
}
