import { Outlet, useRouteLoaderData, type RouteObject } from "react-router-dom";

import { Layout } from "./components/Layout";
import { SiteProvider } from "./site";
import { HomePage } from "./pages/Home";
import { PostPage } from "./pages/Post";
import { AboutPage } from "./pages/About";
import {
  ArchivePage,
  CategoryListPage,
  CategoryPage,
  TagListPage,
  TagPage,
} from "./pages/ListPage";
import { LinksPage } from "./pages/Links";
import {
  rootLoader,
  homeLoader,
  postLoader,
  aboutLoader,
  archiveLoader,
  tagListLoader,
  tagLoader,
  categoryListLoader,
  categoryLoader,
  linksLoader,
} from "./loaders";
import type { RootLoaderData } from "./loaders";

function Root() {
  const data = useRouteLoaderData("root") as RootLoaderData | undefined;
  return (
    <SiteProvider initialSite={data?.site}>
      <Layout>
        <Outlet />
      </Layout>
    </SiteProvider>
  );
}

// SSR only covers public SEO-critical pages.
export const ssrRoutes: RouteObject[] = [
  {
    id: "root",
    path: "/",
    element: <Root />,
    loader: rootLoader,
    children: [
      { id: "home", index: true, element: <HomePage />, loader: homeLoader },
      { id: "post", path: "post/:slug", element: <PostPage />, loader: postLoader },
      { id: "about", path: "about", element: <AboutPage />, loader: aboutLoader },
      { id: "archive", path: "archive", element: <ArchivePage />, loader: archiveLoader },
      { id: "tags", path: "tags", element: <TagListPage />, loader: tagListLoader },
      { id: "tag", path: "tag/:tag", element: <TagPage />, loader: tagLoader },
      { id: "categories", path: "categories", element: <CategoryListPage />, loader: categoryListLoader },
      { id: "category", path: "category/:category", element: <CategoryPage />, loader: categoryLoader },
      { id: "links", path: "links", element: <LinksPage />, loader: linksLoader },
    ],
  },
];
