import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
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
  MdSmartToy,
  MdMenu,
  MdClose,
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
  const [mobileOpen, setMobileOpen] = useState(false);
  const lastVisibleTitleRef = useRef<string>("YaBlog");

  // Check if we are in admin section
  const isAdmin = location.pathname.startsWith("/admin");
  const isAi = location.pathname === "/ai";

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
    setMobileOpen(false);
    navigate(query ? `/search?q=${encodeURIComponent(query)}` : "/");
  };

  const toggleTheme = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
    saveTheme(next);
  };

  useEffect(() => {
    // Close mobile menu on route change
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth > 820) setMobileOpen(false);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Admin & AI pages have their own layout
  if (isAdmin || isAi) {
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
    if (k === "ai" || k === "robot" || k === "smart_toy") return <MdSmartToy />;
    return <MdLink />;
  };

  const brandText = site?.nav?.brandText?.trim() || "YaBlog";
  const baseLinks =
    site?.nav?.links?.length
      ? site.nav.links
      : [
          { label: "首页", path: "/", icon: "home" },
          { label: "归档", path: "/archive", icon: "archive" },
          { label: "标签", path: "/tags", icon: "tag" },
          { label: "友链", path: "/links", icon: "link" },
          { label: "关于", path: "/about", icon: "info" },
        ];
  const navLinks = baseLinks.some((l) => l.path === "/ai") ? baseLinks : [...baseLinks, { label: "AI", path: "/ai", icon: "ai" }];
  const footerText =
    (site?.footer?.text?.trim() || "© {year} YaBlog · Designed with Butterfly Style").replaceAll(
      "{year}",
      String(new Date().getFullYear()),
    );
  const tabTitle = site?.tab?.title?.trim() || brandText || "YaBlog";
  const awayTitle = site?.tab?.awayTitle?.trim() || tabTitle;
  const faviconUrl = site?.tab?.faviconUrl?.trim() || "";

  useEffect(() => {
    // Update favicon (client-side) without rebuild
    if (!faviconUrl) return;
    const head = document.head;
    const links = Array.from(head.querySelectorAll<HTMLLinkElement>('link[rel="icon"], link[rel="shortcut icon"]'));
    const link = links[0] ?? document.createElement("link");
    link.rel = "icon";
    link.href = faviconUrl;
    if (!links[0]) head.appendChild(link);
  }, [faviconUrl]);

  useEffect(() => {
    // Set default title on navigation when visible
    if (document.visibilityState === "visible") {
      document.title = tabTitle;
      lastVisibleTitleRef.current = tabTitle;
    }
  }, [location.pathname, tabTitle]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "hidden") {
        lastVisibleTitleRef.current = document.title || tabTitle;
        document.title = awayTitle;
      } else {
        document.title = lastVisibleTitleRef.current || tabTitle;
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [awayTitle, tabTitle]);

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
            <button
              type="button"
              className="iconButton navToggle"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label="Toggle Menu"
              aria-expanded={mobileOpen}
            >
              {mobileOpen ? <MdClose /> : <MdMenu />}
            </button>
          </div>
        </div>
      </div>

      <div className={`navMobile ${mobileOpen ? "open" : ""}`}>
        <div className="container navMobileInner">
          <form className="search mobileSearch" onSubmit={onSearch}>
            <button type="submit" className="iconButton" aria-label="Search">
              <MdSearch />
            </button>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索..." />
          </form>

          <div className="navMobileLinks">
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
        </div>
      </div>

      {children}

      <div className="footer">
        <div className="container">
          <p>{footerText}</p>
        </div>
      </div>
    </>
  );
}
