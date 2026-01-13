import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, NavLink, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  MdArchive,
  MdDarkMode,
  MdFolder,
  MdHome,
  MdInfo,
  MdLabel,
  MdLightMode,
  MdLink,
  MdSearch,
} from "react-icons/md";

import { applyTheme, getSavedTheme, getSystemTheme, saveTheme, Theme } from "../theme";
import { useSite } from "../site";

export function Layout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { site } = useSite();
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

  const iconFor = (key: string) => {
    const k = (key || "").toLowerCase();
    if (k === "home") return <MdHome />;
    if (k === "archive") return <MdArchive />;
    if (k === "tag" || k === "tags") return <MdLabel />;
    if (k === "category" || k === "categories") return <MdFolder />;
    if (k === "info" || k === "about") return <MdInfo />;
    if (k === "search") return <MdSearch />;
    return <MdLink />;
  };

  const brandText = site?.nav?.brandText?.trim() || "YaBlog";
  const navLinks =
    site?.nav?.links?.length
      ? site.nav.links
      : [
          { label: "首页", path: "/", icon: "home" },
          { label: "归档", path: "/archive", icon: "archive" },
          { label: "标签", path: "/tags", icon: "tag" },
          { label: "关于", path: "/about", icon: "info" },
        ];

  return (
    <>
      <div className={`nav ${isScrolled ? "scrolled" : "transparent"}`}>
        <div className="container navInner">
          <Link to="/" className="brand">
            <span>{brandText}</span>
          </Link>
          <div className="navLinks">
            {navLinks.map((item) => {
              const isExternal = item.path.startsWith("http://") || item.path.startsWith("https://");
              const content = (
                <span className="navLinkInner">
                  <span className="navIcon" aria-hidden="true">
                    {iconFor(item.icon)}
                  </span>
                  <span>{item.label}</span>
                </span>
              );

              return isExternal ? (
                <a key={`${item.label}:${item.path}`} href={item.path} target="_blank" rel="noreferrer">
                  {content}
                </a>
              ) : (
                <NavLink key={`${item.label}:${item.path}`} to={item.path}>
                  {content}
                </NavLink>
              );
            })}
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
