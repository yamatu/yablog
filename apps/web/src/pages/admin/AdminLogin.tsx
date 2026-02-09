import { FormEvent, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../../api";
import "../../admin.css";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function AdminLoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [sp] = useSearchParams();
  const from = (location.state as any)?.from ?? sp.get("from") ?? "/admin";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      await api.login({ username, password });
      navigate(from, { replace: true });
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="adminRoot flex min-h-screen items-center justify-center" style={{ background: "var(--bg)" }}>
      <Card className="w-full max-w-[400px] shadow-lg">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">后台登录</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="grid gap-4">
            <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="用户名" />
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="密码"
            />
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "登录中…" : "登录"}
            </Button>
            {err ? <div className="text-center text-sm text-destructive">{err}</div> : null}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
