import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

import { api, SiteSettings } from "./api";

type SiteState = {
  site: SiteSettings | null;
  loading: boolean;
  refresh: () => Promise<void>;
};

const SiteContext = createContext<SiteState | null>(null);

export function SiteProvider({ children }: { children: React.ReactNode }) {
  const [site, setSite] = useState<SiteSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    const res = await api.site();
    setSite(res.site);
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await api.site();
        if (!alive) return;
        setSite(res.site);
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const value = useMemo(() => ({ site, loading, refresh }), [site, loading]);

  return <SiteContext.Provider value={value}>{children}</SiteContext.Provider>;
}

export function useSite() {
  const ctx = useContext(SiteContext);
  if (!ctx) throw new Error("useSite must be used within SiteProvider");
  return ctx;
}

