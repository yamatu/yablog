import { useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { api, User } from "../../api";
import "../../admin.css";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

export function useMe() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await api.me();
        if (!alive) return;
        setUser(res.user);
      } catch {
        if (!alive) return;
        setUser(null);
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
  return { user, loading, refresh: async () => api.me().then((r) => setUser(r.user)) };
}

export function AdminLayoutWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="adminRoot" style={{ minHeight: "100vh", background: "var(--bg)", padding: "40px 20px" }}>
      <div className="container" style={{ maxWidth: 1280 }}>
        {children}
      </div>
    </div>
  );
}

export function AdminNav({ onLogout }: { onLogout: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const path = location.pathname;

  const isActive = (p: string) => {
    if (p === "/admin") return path === "/admin" || path === "/admin/new" || path.startsWith("/admin/edit/");
    return path.startsWith(p);
  };

  return (
    <div className="flex items-center gap-2 flex-wrap mb-6 p-4 rounded-xl bg-card border border-border">
      <h1 className="text-lg font-bold mr-auto">YaBlog 控制台</h1>
      <Button variant={isActive("/admin") ? "default" : "ghost"} size="sm" onClick={() => navigate("/admin")}>文章</Button>
      <Button variant={isActive("/admin/media") ? "default" : "ghost"} size="sm" onClick={() => navigate("/admin/media")}>图库</Button>
      <Button variant={isActive("/admin/comments") ? "default" : "ghost"} size="sm" onClick={() => navigate("/admin/comments")}>评论</Button>
      <Button variant={isActive("/admin/links") ? "default" : "ghost"} size="sm" onClick={() => navigate("/admin/links")}>友链</Button>
      <Button variant={isActive("/admin/security") ? "default" : "ghost"} size="sm" onClick={() => navigate("/admin/security")}>安全</Button>
      <Button variant={isActive("/admin/settings") ? "default" : "ghost"} size="sm" onClick={() => navigate("/admin/settings")}>设置</Button>
      <Separator orientation="vertical" className="h-6" />
      <Button variant="outline" size="sm" onClick={onLogout}>退出</Button>
    </div>
  );
}

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useMe();
  const location = useLocation();
  if (loading) return <div className="container" style={{ padding: "26px 0" }}>加载中…</div>;
  if (!user) return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}
