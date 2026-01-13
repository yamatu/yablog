import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Link } from "react-router-dom";

import { api, Post } from "../api";

export function AboutPage() {
  const [post, setPost] = useState<Post | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await api.getPost("about");
        if (!alive) return;
        setPost(res.post);
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message ?? String(e));
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="container" style={{ padding: "26px 0 50px" }}>
      <div className="glass content">
        <h2 style={{ marginTop: 0 }}>关于</h2>
        {post ? (
          <div className="markdown">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{post.contentMd}</ReactMarkdown>
          </div>
        ) : (
          <>
            <div className="muted">
              {err ? `未找到 about 页面（${err}）` : "你还没有创建 about 页面。"}
            </div>
            <div style={{ height: 12 }} />
            <div className="muted">
              去 <Link to="/admin">后台</Link> 新建一篇文章并设置 slug 为 <code>about</code>{" "}
              即可。
            </div>
          </>
        )}
      </div>
    </div>
  );
}

