import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, NavLink, useNavigate, useSearchParams } from "react-router-dom";
import { MdDarkMode, MdLightMode } from "react-icons/md";

import { applyTheme, getSavedTheme, getSystemTheme, saveTheme, Theme } from "../theme";

export function Layout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const initial = useMemo(() => sp.get("q") ?? "", [sp]);
  const [q, setQ] = useState(initial);
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const t = getSavedTheme() ?? getSystemTheme();
    setTheme(t);
    applyTheme(t);
  }, []);

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    const query = q.trim();
    navigate(query ? `/search?q=${encodeURIComponent(query)}` : "/");
  };

  const toggleTheme = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
    saveTheme(next);
  };

  return (
    <>
      <div className="nav">
        <div className="container navInner">
          <Link to="/" className="brand">
            <span className="brandDot" />
            <span>YaBlog</span>
          </Link>
          <div className="navLinks">
            <NavLink to="/archive">归档</NavLink>
            <NavLink to="/tags">标签</NavLink>
            <NavLink to="/categories">分类</NavLink>
            <NavLink to="/about">关于</NavLink>
            <NavLink to="/admin">后台</NavLink>
          </div>
          <div className="navRight">
            <button
              type="button"
              className="iconButton"
              onClick={toggleTheme}
              aria-label={theme === "dark" ? "切换到浅色模式" : "切换到深色模式"}
              data-tooltip={theme === "dark" ? "浅色模式" : "深色模式"}
            >
              {theme === "dark" ? <MdLightMode /> : <MdDarkMode />}
            </button>
            <form className="search" onSubmit={onSearch}>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="搜索文章…"
              />
            </form>
          </div>
        </div>
      </div>
      {children}
      <div className="footer">
        <div className="container">© {new Date().getFullYear()} YaBlog · React + Node.js + SQLite</div>
      </div>
    </>
  );
}
