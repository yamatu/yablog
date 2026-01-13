import { BrowserRouter, Route, Routes } from "react-router-dom";

import { Layout } from "./components/Layout";
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
import { AdminEditorPage, AdminIndexPage, AdminLoginPage, AdminSettingsPage } from "./pages/admin/Admin";

export function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/post/:slug" element={<PostPage />} />
          <Route path="/archive" element={<ArchivePage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/tags" element={<TagListPage />} />
          <Route path="/tag/:tag" element={<TagPage />} />
          <Route path="/categories" element={<CategoryListPage />} />
          <Route path="/category/:category" element={<CategoryPage />} />
          <Route path="/about" element={<AboutPage />} />

          <Route path="/admin/login" element={<AdminLoginPage />} />
          <Route path="/admin" element={<AdminIndexPage />} />
          <Route path="/admin/new" element={<AdminEditorPage mode="new" />} />
          <Route path="/admin/edit/:id" element={<AdminEditorPage mode="edit" />} />
          <Route path="/admin/settings" element={<AdminSettingsPage />} />

          <Route path="*" element={<HomePage />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
