import { Outlet, type RouteObject } from "react-router-dom";

import { Layout } from "./components/Layout";
import { SiteProvider } from "./site";
import { HomePage } from "./pages/Home";
import { PostPage } from "./pages/Post";
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

// SSR only covers public SEO-critical pages.
export const ssrRoutes: RouteObject[] = [
  {
    path: "/",
    element: <Root />,
    children: [
      { id: "home", index: true, element: <HomePage />, loader: homeLoader },
      { id: "post", path: "post/:slug", element: <PostPage />, loader: postLoader },
    ],
  },
];
