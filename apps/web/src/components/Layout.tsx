import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, NavLink, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { MdDarkMode, MdLightMode, MdSearch } from "react-icons/md";

import { applyTheme, getSavedTheme, getSystemTheme, saveTheme, Theme } from "../theme";

export function Layout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [sp] = useSearchParams();
  const initial = useMemo(() => sp.get("q") ?? "", [sp]);
  const [q, setQ] = useState(initial);
  const [theme, setTheme] = useState<Theme>("light");
  const [isScrolled, setIsScrolled] = useState(false);

  // Check if we are in admin section
  const isAdmin = location.pathname.startsWith("/admin");

  useEffect(() => {
    const t = getSavedTheme() ?? getSystemTheme();
    setTheme(t);
    applyTheme(t);
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
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

  // If admin, render just children (admin pages have their own layout)
  if (isAdmin) {
    return <>{children}</>;
  }

  return (
    <>
      <div className={`nav ${isScrolled ? "scrolled" : "transparent"}`}>
        <div className="container navInner">
          <Link to="/" className="brand">
            <span>YaBlog</span>
          </Link>
          <div className="navLinks">
            <NavLink to="/">首页</NavLink>
            <NavLink to="/archive">归档</NavLink>
            <NavLink to="/tags">标签</NavLink>
            <NavLink to="/about">关于</NavLink>
          </div>
          <div className="navRight">
            <form className="search" onSubmit={onSearch}>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="搜索..."
              />
            </form>
            <button
              type="button"
              className="iconButton"
              onClick={toggleTheme}
              aria-label="Toggle Theme"
            >
              {theme === "dark" ? <MdLightMode /> : <MdDarkMode />}
            </button>
          </div>
        </div>
      </div>

      {children}

      <div className="footer">
        <div className="container">
          <p>© {new Date().getFullYear()} YaBlog · Designed with Butterfly Style</p>
        </div>
      </div>
    </>
  );
}
