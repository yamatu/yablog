import {
  Outlet,
  isRouteErrorResponse,
  useRouteError,
  Navigate,
  type RouteObject,
} from "react-router-dom";

import { Layout } from "./components/Layout";
import { SiteProvider } from "./site";
import { AboutPage } from "./pages/About";
import {
  ArchivePage,
  CategoryListPage,
  CategoryPage,
  SearchPage,
  TagListPage,
  TagPage,
} from "./pages/ListPage";
import { HomePage } from "./pages/Home";
import { PostPage } from "./pages/Post";
import { LinksPage } from "./pages/Links";
import { AiPage } from "./pages/Ai";
import {
  AdminCommentsPage,
  AdminEditorPage,
  AdminIndexPage,
  AdminLinksPage,
  AdminLoginPage,
  AdminMediaPage,
  AdminSecurityPage,
  AdminSettingsPage,
} from "./pages/admin/Admin";

import { homeLoader, postLoader } from "./loaders";

function Root() {
  return (
    <SiteProvider>
      <Layout>
        <Outlet />
      </Layout>
    </SiteProvider>
  );
}

function RootError() {
  const err = useRouteError();
  const message = (() => {
    if (isRouteErrorResponse(err)) return `${err.status} ${err.statusText}`;
    if (err instanceof Error) return err.message;
    return String(err);
  })();

  return (
    <SiteProvider>
      <Layout>
        <div className="container" style={{ padding: "100px 0" }}>
          <div className="card content">
            <h2 style={{ marginTop: 0 }}>加载失败</h2>
            <div className="muted">{message}</div>
          </div>
        </div>
      </Layout>
    </SiteProvider>
  );
}

export const routes: RouteObject[] = [
  {
    path: "/",
    element: <Root />,
    errorElement: <RootError />,
    children: [
      { id: "home", index: true, element: <HomePage />, loader: homeLoader },
      { id: "post", path: "post/:slug", element: <PostPage />, loader: postLoader },
      { path: "archive", element: <ArchivePage /> },
      { path: "search", element: <SearchPage /> },
      { path: "tags", element: <TagListPage /> },
      { path: "tag/:tag", element: <TagPage /> },
      { path: "categories", element: <CategoryListPage /> },
      { path: "category/:category", element: <CategoryPage /> },
      { path: "about", element: <AboutPage /> },
      { path: "links", element: <LinksPage /> },
      { path: "ai", element: <AiPage /> },

      { path: "admin/login", element: <AdminLoginPage /> },
      { path: "admin", element: <AdminIndexPage /> },
      { path: "admin/new", element: <AdminEditorPage mode="new" /> },
      { path: "admin/edit/:id", element: <AdminEditorPage mode="edit" /> },
      { path: "admin/media", element: <AdminMediaPage /> },
      { path: "admin/comments", element: <AdminCommentsPage /> },
      { path: "admin/links", element: <AdminLinksPage /> },
      { path: "admin/security", element: <AdminSecurityPage /> },
      { path: "admin/settings", element: <AdminSettingsPage /> },

      // Prevent rendering HomePage without its loader
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
];
