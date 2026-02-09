import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { api } from "../../api";
import { MediaLibraryPanel } from "../../components/MediaLibraryModal";
import { AdminLayoutWrapper, AdminNav, useMe } from "./AdminLayout";

import { Card, CardContent } from "@/components/ui/card";

export function AdminMediaPage() {
  const { user, loading } = useMe();
  const location = useLocation();
  const navigate = useNavigate();
  const [msg, setMsg] = useState<string | null>(null);

  if (loading) return <div className="container" style={{ padding: "26px 0" }}>加载中…</div>;
  if (!user) return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;

  const onLogout = async () => {
    await api.logout().catch(() => {});
    navigate("/admin/login", { replace: true });
  };

  return (
    <AdminLayoutWrapper>
      <AdminNav onLogout={onLogout} />

      <Card>
        <CardContent className="p-6">
          <div className="flex justify-between items-center gap-3 flex-wrap mb-4">
            <div>
              <h2 className="text-xl font-bold">图库</h2>
              <p className="text-sm text-muted-foreground">管理站点上传的图片（支持替换保持 URL 不变）</p>
            </div>
          </div>

          {msg ? <div className="text-sm text-green-600 mb-3">{msg}</div> : null}

          <MediaLibraryPanel
            showClose={false}
            containerStyle={{ width: "100%", maxHeight: "none" }}
            onSelect={async (url) => {
              try {
                await navigator.clipboard.writeText(url);
                setMsg(`已复制：${url}`);
                setTimeout(() => setMsg(null), 1800);
              } catch {
                setMsg(url);
                setTimeout(() => setMsg(null), 1800);
              }
            }}
          />
        </CardContent>
      </Card>
    </AdminLayoutWrapper>
  );
}
