import type { Link as FriendlyLink, Post, SiteSettings } from "./api";
import type {
  AboutLoaderData,
  ArchiveLoaderData,
  CategoryListLoaderData,
  CategoryLoaderData,
  HomeLoaderData,
  LinksLoaderData,
  PostLoaderData,
  RootLoaderData,
  TagListLoaderData,
  TagLoaderData,
} from "./loaders";

type JsonLd = Record<string, unknown>;

type HeadTag =
  | { type: "meta"; attrs: Record<string, string> }
  | { type: "link"; attrs: Record<string, string> }
  | { type: "script"; attrs: Record<string, string>; content: string };

export type SeoLoaderData = Partial<{
  root: RootLoaderData | null;
  home: HomeLoaderData | null;
  post: PostLoaderData | null;
  about: AboutLoaderData | null;
  archive: ArchiveLoaderData | null;
  tags: TagListLoaderData | null;
  tag: TagLoaderData | null;
  categories: CategoryListLoaderData | null;
  category: CategoryLoaderData | null;
  links: LinksLoaderData | null;
}>;

export type SeoHead = {
  title: string;
  tags: HeadTag[];
};

const MANAGED_ATTR = "data-yablog-seo";
const DEFAULT_ROBOTS = "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1";
const NOINDEX_ROBOTS = "noindex,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1";
const ADMIN_ROBOTS = "noindex,nofollow,noarchive";
const LOCALE = "zh_CN";
const LANGUAGE = "zh-CN";

const isAbsoluteUrl = (value: string) => /^https?:\/\//i.test(value);

function absoluteUrl(origin: string, value?: string | null) {
  const input = String(value ?? "").trim();
  if (!input) return "";
  if (isAbsoluteUrl(input)) return input;
  if (input.startsWith("//")) return `${new URL(origin).protocol}${input}`;
  try {
    return new URL(input, `${origin}/`).toString();
  } catch {
    return "";
  }
}

function cleanText(value: string) {
  return value
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/^[>#\-*+\d.\s]+/gm, " ")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(value: string, max = 160) {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function toDescription(value: string, fallback: string) {
  const cleaned = cleanText(value || "");
  return truncate(cleaned || fallback, 160);
}

function uniqueKeywords(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of values) {
    const item = String(raw ?? "").trim();
    if (!item) continue;
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function brandName(site: SiteSettings | null) {
  return (
    site?.nav?.brandText?.trim() ||
    site?.home?.title?.trim() ||
    site?.tab?.title?.trim() ||
    "YaBlog"
  );
}

function titleBase(site: SiteSettings | null) {
  return site?.tab?.title?.trim() || brandName(site);
}

function authorName(site: SiteSettings | null) {
  return site?.sidebar?.name?.trim() || brandName(site);
}

function defaultDescription(site: SiteSettings | null) {
  return toDescription(
    site?.seo?.defaultDescription || site?.home?.subtitle || site?.sidebar?.bio || "",
    `${brandName(site)} 的个人博客，记录技术、代码与生活观察。`,
  );
}

function defaultKeywords(site: SiteSettings | null) {
  const base = site?.seo?.defaultKeywords?.length
    ? site.seo.defaultKeywords
    : [brandName(site), "博客", "技术博客", "编程"];
  return uniqueKeywords(base);
}

function defaultImage(site: SiteSettings | null, origin: string) {
  return (
    absoluteUrl(origin, site?.seo?.defaultOgImage) ||
    absoluteUrl(origin, site?.images?.homeHero) ||
    absoluteUrl(origin, site?.images?.defaultPostCover)
  );
}

function defaultImageAlt(site: SiteSettings | null) {
  return site?.seo?.defaultOgImageAlt?.trim() || brandName(site);
}

function normalizeHandle(value?: string | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  return raw.startsWith("@") ? raw : `@${raw.replace(/^@+/, "")}`;
}

function siteSocialUrls(site: SiteSettings | null) {
  const urls = [
    ...(site?.sidebar?.socials ?? []).map((item) => item.url),
    ...(site?.sidebar?.followButtons ?? []).map((item) => item.url),
  ];
  return uniqueKeywords(urls.filter((item) => isAbsoluteUrl(item)));
}

function joinTitle(pageTitle: string, site: SiteSettings | null) {
  const base = titleBase(site);
  return pageTitle === base ? pageTitle : `${pageTitle} - ${base}`;
}

function breadcrumbJsonLd(items: Array<{ name: string; url: string }>): JsonLd | null {
  if (items.length < 2) return null;
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

function postListItems(posts: Post[], origin: string) {
  return posts.map((post, index) => ({
    "@type": "ListItem",
    position: index + 1,
    url: `${origin}/post/${encodeURIComponent(post.slug)}`,
    name: post.title,
  }));
}

function linkListItems(links: FriendlyLink[]) {
  return links
    .filter((item) => isAbsoluteUrl(item.url))
    .map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: item.url,
      name: item.title,
      description: item.description || undefined,
    }));
}

function organizationJsonLd(site: SiteSettings | null, origin: string) {
  const logo = absoluteUrl(origin, site?.tab?.faviconUrl) || absoluteUrl(origin, site?.sidebar?.avatarUrl);
  const sameAs = siteSocialUrls(site);
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: brandName(site),
    url: `${origin}/`,
    logo: logo ? { "@type": "ImageObject", url: logo } : undefined,
    sameAs: sameAs.length ? sameAs : undefined,
  };
}

function personJsonLd(site: SiteSettings | null, origin: string) {
  const image = absoluteUrl(origin, site?.sidebar?.avatarUrl);
  const sameAs = siteSocialUrls(site);
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    name: authorName(site),
    description: cleanText(site?.sidebar?.bio ?? "") || undefined,
    image: image || undefined,
    sameAs: sameAs.length ? sameAs : undefined,
    url: `${origin}/about`,
  };
}

function meta(attrs: Record<string, string>): HeadTag {
  return { type: "meta", attrs: { ...attrs, [MANAGED_ATTR]: "1" } };
}

function link(attrs: Record<string, string>): HeadTag {
  return { type: "link", attrs: { ...attrs, [MANAGED_ATTR]: "1" } };
}

function script(content: string): HeadTag {
  return {
    type: "script",
    attrs: { type: "application/ld+json", [MANAGED_ATTR]: "1" },
    content,
  };
}

function createHead(args: {
  site: SiteSettings | null;
  title: string;
  description: string;
  canonical: string;
  robots?: string;
  keywords?: string[];
  image?: string;
  imageAlt?: string;
  ogType?: string;
  extraTags?: HeadTag[];
  jsonLd?: JsonLd[];
}) {
  const site = args.site;
  const twitterHandle = normalizeHandle(site?.seo?.twitterHandle);
  const image = args.image || "";
  const imageAlt = args.imageAlt || defaultImageAlt(site);
  const tags: HeadTag[] = [
    meta({ name: "description", content: args.description }),
    meta({ name: "robots", content: args.robots || DEFAULT_ROBOTS }),
    meta({ name: "author", content: authorName(site) }),
    link({ rel: "canonical", href: args.canonical }),
    meta({ property: "og:type", content: args.ogType || "website" }),
    meta({ property: "og:title", content: args.title }),
    meta({ property: "og:description", content: args.description }),
    meta({ property: "og:url", content: args.canonical }),
    meta({ property: "og:site_name", content: brandName(site) }),
    meta({ property: "og:locale", content: LOCALE }),
    meta({ name: "twitter:card", content: image ? "summary_large_image" : "summary" }),
    meta({ name: "twitter:title", content: args.title }),
    meta({ name: "twitter:description", content: args.description }),
  ];

  if (args.keywords?.length) {
    tags.push(meta({ name: "keywords", content: args.keywords.join(", ") }));
  }
  if (image) {
    tags.push(meta({ property: "og:image", content: image }));
    tags.push(meta({ property: "og:image:alt", content: imageAlt }));
    tags.push(meta({ name: "twitter:image", content: image }));
    tags.push(meta({ name: "twitter:image:alt", content: imageAlt }));
  }
  if (twitterHandle) {
    tags.push(meta({ name: "twitter:site", content: twitterHandle }));
    tags.push(meta({ name: "twitter:creator", content: twitterHandle }));
  }
  if (args.extraTags?.length) tags.push(...args.extraTags);
  if (args.jsonLd?.length) {
    for (const item of args.jsonLd) {
      tags.push(script(JSON.stringify(item)));
    }
  }
  return { title: args.title, tags } satisfies SeoHead;
}

export function buildSeoHead(args: {
  url: URL;
  loaderData?: SeoLoaderData | null;
  site?: SiteSettings | null;
}): SeoHead {
  const loaderData = args.loaderData ?? {};
  const site = args.site ?? loaderData.root?.site ?? null;
  const origin = args.url.origin;
  const path = args.url.pathname;
  const homeCanonical = `${origin}/`;
  const fallbackDescription = defaultDescription(site);
  const fallbackKeywords = defaultKeywords(site);
  const fallbackImage = defaultImage(site, origin);

  if (path.startsWith("/admin")) {
    return createHead({
      site,
      title: joinTitle("管理后台", site),
      description: fallbackDescription,
      canonical: `${origin}${path}`,
      robots: ADMIN_ROBOTS,
      keywords: fallbackKeywords,
      image: fallbackImage,
      imageAlt: defaultImageAlt(site),
    });
  }

  if (path === "/search") {
    const q = args.url.searchParams.get("q")?.trim() || "";
    const pageTitle = q ? `搜索：${q}` : "站内搜索";
    const description = q
      ? `查看 ${brandName(site)} 站内与“${q}”相关的搜索结果。`
      : `在 ${brandName(site)} 中按关键词搜索文章、标签与专题内容。`;
    return createHead({
      site,
      title: joinTitle(pageTitle, site),
      description,
      canonical: q ? `${origin}/search?q=${encodeURIComponent(q)}` : `${origin}/search`,
      robots: NOINDEX_ROBOTS,
      keywords: uniqueKeywords([q, ...fallbackKeywords]),
      image: fallbackImage,
      imageAlt: defaultImageAlt(site),
    });
  }

  if (path === "/") {
    const data = loaderData.home ?? null;
    const posts = [...(data?.pinned ?? []), ...(data?.posts ?? [])].slice(0, 8);
    const title = site?.home?.title?.trim() || titleBase(site);
    const description = fallbackDescription;
    const websiteJsonLd: JsonLd = {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: brandName(site),
      alternateName: titleBase(site),
      description,
      url: homeCanonical,
      inLanguage: LANGUAGE,
      potentialAction: {
        "@type": "SearchAction",
        target: `${origin}/search?q={search_term_string}`,
        "query-input": "required name=search_term_string",
      },
    };
    const blogJsonLd: JsonLd | null = posts.length
      ? {
          "@context": "https://schema.org",
          "@type": "Blog",
          name: brandName(site),
          description,
          url: homeCanonical,
          inLanguage: LANGUAGE,
          blogPost: posts.slice(0, 6).map((post) => ({
            "@type": "BlogPosting",
            headline: post.title,
            url: `${origin}/post/${encodeURIComponent(post.slug)}`,
            datePublished: post.publishedAt || post.createdAt,
            dateModified: post.updatedAt,
          })),
        }
      : null;
    return createHead({
      site,
      title,
      description,
      canonical: homeCanonical,
      keywords: fallbackKeywords,
      image: fallbackImage,
      imageAlt: defaultImageAlt(site),
      jsonLd: [websiteJsonLd, organizationJsonLd(site, origin), ...(blogJsonLd ? [blogJsonLd] : [])],
    });
  }

  if (path.startsWith("/post/")) {
    const data = loaderData.post ?? null;
    const post = data?.post ?? null;
    if (!post) {
      return createHead({
        site,
        title: joinTitle("文章未找到", site),
        description: "你访问的文章不存在，或者已经被移除。",
        canonical: `${origin}${path}`,
        robots: NOINDEX_ROBOTS,
        keywords: fallbackKeywords,
        image: fallbackImage,
        imageAlt: defaultImageAlt(site),
      });
    }

    const canonical = `${origin}/post/${encodeURIComponent(post.slug)}`;
    const description = toDescription(post.summary || post.contentMd, fallbackDescription);
    const image = absoluteUrl(origin, post.coverImage) || fallbackImage;
    const keywords = uniqueKeywords([...post.tags, ...post.categories, ...fallbackKeywords]);
    const publishedTime = post.publishedAt || post.createdAt;
    const modifiedTime = post.updatedAt || publishedTime;
    const articleJsonLd: JsonLd = {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: post.title,
      description,
      url: canonical,
      mainEntityOfPage: canonical,
      inLanguage: LANGUAGE,
      datePublished: publishedTime,
      dateModified: modifiedTime,
      image: image || undefined,
      keywords: keywords.join(", "),
      articleSection: post.categories[0] || undefined,
      author: {
        "@type": "Person",
        name: authorName(site),
        url: `${origin}/about`,
      },
      publisher: {
        "@type": "Organization",
        name: brandName(site),
        logo: absoluteUrl(origin, site?.tab?.faviconUrl) || absoluteUrl(origin, site?.sidebar?.avatarUrl) || undefined,
      },
    };
    const breadcrumb = breadcrumbJsonLd([
      { name: brandName(site), url: homeCanonical },
      { name: post.title, url: canonical },
    ]);
    const extraTags = [
      meta({ property: "article:published_time", content: publishedTime }),
      meta({ property: "article:modified_time", content: modifiedTime }),
      ...(post.categories[0] ? [meta({ property: "article:section", content: post.categories[0] })] : []),
      ...post.tags.map((tag) => meta({ property: "article:tag", content: tag })),
    ];
    return createHead({
      site,
      title: post.title,
      description,
      canonical,
      keywords,
      image,
      imageAlt: post.title,
      ogType: "article",
      extraTags,
      jsonLd: [articleJsonLd, ...(breadcrumb ? [breadcrumb] : [])],
    });
  }

  if (path === "/about") {
    const about = loaderData.about?.about ?? site?.about ?? null;
    const canonical = `${origin}/about`;
    const pageTitle = about?.title?.trim() || "关于";
    const description = toDescription(about?.contentMd || site?.sidebar?.bio || "", fallbackDescription);
    const image = absoluteUrl(origin, site?.images?.aboutHero) || fallbackImage;
    const aboutJsonLd: JsonLd = {
      "@context": "https://schema.org",
      "@type": "AboutPage",
      name: pageTitle,
      description,
      url: canonical,
      inLanguage: LANGUAGE,
      mainEntity: personJsonLd(site, origin),
    };
    const breadcrumb = breadcrumbJsonLd([
      { name: brandName(site), url: homeCanonical },
      { name: pageTitle, url: canonical },
    ]);
    return createHead({
      site,
      title: joinTitle(pageTitle, site),
      description,
      canonical,
      keywords: uniqueKeywords([pageTitle, authorName(site), ...fallbackKeywords]),
      image,
      imageAlt: pageTitle,
      jsonLd: [aboutJsonLd, ...(breadcrumb ? [breadcrumb] : [])],
    });
  }

  if (path === "/archive") {
    const posts = loaderData.archive?.posts ?? [];
    const canonical = `${origin}/archive`;
    const description = posts.length
      ? `浏览 ${brandName(site)} 的文章归档，目前已整理 ${posts.length} 篇近期内容。`
      : `${brandName(site)} 的文章归档页，按时间浏览历史内容。`;
    const itemList = postListItems(posts.slice(0, 20), origin);
    const collectionJsonLd: JsonLd = {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "归档",
      description,
      url: canonical,
      inLanguage: LANGUAGE,
      mainEntity: itemList.length
        ? {
            "@type": "ItemList",
            itemListElement: itemList,
            numberOfItems: itemList.length,
          }
        : undefined,
    };
    const breadcrumb = breadcrumbJsonLd([
      { name: brandName(site), url: homeCanonical },
      { name: "归档", url: canonical },
    ]);
    return createHead({
      site,
      title: joinTitle("归档", site),
      description,
      canonical,
      keywords: uniqueKeywords(["归档", ...fallbackKeywords]),
      image: absoluteUrl(origin, site?.images?.archiveHero) || fallbackImage,
      imageAlt: "归档",
      jsonLd: [collectionJsonLd, ...(breadcrumb ? [breadcrumb] : [])],
    });
  }

  if (path === "/tags") {
    const tags = loaderData.tags?.tags ?? [];
    const canonical = `${origin}/tags`;
    const description = tags.length
      ? `${brandName(site)} 当前整理了 ${tags.length} 个标签，方便按主题快速浏览文章。`
      : `${brandName(site)} 的标签索引页，帮助搜索引擎与读者理解内容主题。`;
    const collectionJsonLd: JsonLd = {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "标签",
      description,
      url: canonical,
      inLanguage: LANGUAGE,
      mainEntity: tags.length
        ? {
            "@type": "ItemList",
            itemListElement: tags.slice(0, 50).map((tag, index) => ({
              "@type": "ListItem",
              position: index + 1,
              name: tag,
              url: `${origin}/tag/${encodeURIComponent(tag)}`,
            })),
            numberOfItems: tags.length,
          }
        : undefined,
    };
    const breadcrumb = breadcrumbJsonLd([
      { name: brandName(site), url: homeCanonical },
      { name: "标签", url: canonical },
    ]);
    return createHead({
      site,
      title: joinTitle("标签", site),
      description,
      canonical,
      keywords: uniqueKeywords(["标签", ...tags.slice(0, 10), ...fallbackKeywords]),
      image: absoluteUrl(origin, site?.images?.tagsHero) || fallbackImage,
      imageAlt: "标签",
      jsonLd: [collectionJsonLd, ...(breadcrumb ? [breadcrumb] : [])],
    });
  }

  if (path.startsWith("/tag/")) {
    const tag = decodeURIComponent(path.slice("/tag/".length));
    const posts = loaderData.tag?.posts ?? [];
    const canonical = `${origin}/tag/${encodeURIComponent(tag)}`;
    const description = posts.length
      ? `查看 ${brandName(site)} 中与“${tag}”相关的 ${posts.length} 篇文章。`
      : `浏览 ${brandName(site)} 中与“${tag}”相关的文章与主题内容。`;
    const itemList = postListItems(posts.slice(0, 20), origin);
    const collectionJsonLd: JsonLd = {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: `标签：${tag}`,
      description,
      url: canonical,
      inLanguage: LANGUAGE,
      about: tag,
      mainEntity: itemList.length
        ? {
            "@type": "ItemList",
            itemListElement: itemList,
            numberOfItems: itemList.length,
          }
        : undefined,
    };
    const breadcrumb = breadcrumbJsonLd([
      { name: brandName(site), url: homeCanonical },
      { name: "标签", url: `${origin}/tags` },
      { name: tag, url: canonical },
    ]);
    return createHead({
      site,
      title: joinTitle(`标签：${tag}`, site),
      description,
      canonical,
      keywords: uniqueKeywords([tag, "标签", ...fallbackKeywords]),
      image: absoluteUrl(origin, site?.images?.tagsHero) || fallbackImage,
      imageAlt: tag,
      jsonLd: [collectionJsonLd, ...(breadcrumb ? [breadcrumb] : [])],
    });
  }

  if (path === "/categories") {
    const categories = loaderData.categories?.categories ?? [];
    const canonical = `${origin}/categories`;
    const description = categories.length
      ? `${brandName(site)} 当前整理了 ${categories.length} 个分类，帮助读者按专题阅读。`
      : `${brandName(site)} 的分类索引页，帮助读者快速定位主题内容。`;
    const collectionJsonLd: JsonLd = {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "分类",
      description,
      url: canonical,
      inLanguage: LANGUAGE,
      mainEntity: categories.length
        ? {
            "@type": "ItemList",
            itemListElement: categories.slice(0, 50).map((category, index) => ({
              "@type": "ListItem",
              position: index + 1,
              name: category.name,
              url: `${origin}/category/${encodeURIComponent(category.name)}`,
            })),
            numberOfItems: categories.length,
          }
        : undefined,
    };
    const breadcrumb = breadcrumbJsonLd([
      { name: brandName(site), url: homeCanonical },
      { name: "分类", url: canonical },
    ]);
    return createHead({
      site,
      title: joinTitle("分类", site),
      description,
      canonical,
      keywords: uniqueKeywords(["分类", ...categories.slice(0, 10).map((item) => item.name), ...fallbackKeywords]),
      image: absoluteUrl(origin, site?.images?.tagsHero) || fallbackImage,
      imageAlt: "分类",
      jsonLd: [collectionJsonLd, ...(breadcrumb ? [breadcrumb] : [])],
    });
  }

  if (path.startsWith("/category/")) {
    const category = decodeURIComponent(path.slice("/category/".length));
    const posts = loaderData.category?.posts ?? [];
    const canonical = `${origin}/category/${encodeURIComponent(category)}`;
    const description = posts.length
      ? `查看 ${brandName(site)} 中属于“${category}”分类的 ${posts.length} 篇文章。`
      : `浏览 ${brandName(site)} 中“${category}”分类下的文章内容。`;
    const itemList = postListItems(posts.slice(0, 20), origin);
    const collectionJsonLd: JsonLd = {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: `分类：${category}`,
      description,
      url: canonical,
      inLanguage: LANGUAGE,
      about: category,
      mainEntity: itemList.length
        ? {
            "@type": "ItemList",
            itemListElement: itemList,
            numberOfItems: itemList.length,
          }
        : undefined,
    };
    const breadcrumb = breadcrumbJsonLd([
      { name: brandName(site), url: homeCanonical },
      { name: "分类", url: `${origin}/categories` },
      { name: category, url: canonical },
    ]);
    return createHead({
      site,
      title: joinTitle(`分类：${category}`, site),
      description,
      canonical,
      keywords: uniqueKeywords([category, "分类", ...fallbackKeywords]),
      image: absoluteUrl(origin, site?.images?.tagsHero) || fallbackImage,
      imageAlt: category,
      jsonLd: [collectionJsonLd, ...(breadcrumb ? [breadcrumb] : [])],
    });
  }

  if (path === "/links") {
    const linksData = loaderData.links?.links ?? [];
    const canonical = `${origin}/links`;
    const description = linksData.length
      ? `${brandName(site)} 收录了 ${linksData.length} 个精选友情链接与推荐站点。`
      : `${brandName(site)} 的友情链接页面，展示值得关注的站点与合作伙伴。`;
    const itemList = linkListItems(linksData.slice(0, 50));
    const collectionJsonLd: JsonLd = {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "友情链接",
      description,
      url: canonical,
      inLanguage: LANGUAGE,
      mainEntity: itemList.length
        ? {
            "@type": "ItemList",
            itemListElement: itemList,
            numberOfItems: itemList.length,
          }
        : undefined,
    };
    const breadcrumb = breadcrumbJsonLd([
      { name: brandName(site), url: homeCanonical },
      { name: "友情链接", url: canonical },
    ]);
    return createHead({
      site,
      title: joinTitle("友情链接", site),
      description,
      canonical,
      keywords: uniqueKeywords(["友情链接", "推荐站点", ...fallbackKeywords]),
      image: absoluteUrl(origin, site?.images?.archiveHero) || fallbackImage,
      imageAlt: "友情链接",
      jsonLd: [collectionJsonLd, ...(breadcrumb ? [breadcrumb] : [])],
    });
  }

  return createHead({
    site,
    title: titleBase(site),
    description: fallbackDescription,
    canonical: `${origin}${path}`,
    keywords: fallbackKeywords,
    image: fallbackImage,
    imageAlt: defaultImageAlt(site),
  });
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeJsonLd(value: string) {
  return value.replaceAll("</", "<\\/");
}

export function renderSeoHead(head: SeoHead) {
  const parts = [`<title>${escapeHtml(head.title)}</title>`];
  for (const tag of head.tags) {
    const attrs = Object.entries(tag.attrs)
      .map(([key, value]) => `${key}="${escapeHtml(value)}"`)
      .join(" ");
    if (tag.type === "script") {
      parts.push(`<script ${attrs}>${escapeJsonLd(tag.content)}</script>`);
      continue;
    }
    parts.push(`<${tag.type} ${attrs} />`);
  }
  return `\n${parts.join("\n")}\n`;
}

export function applySeoHead(head: SeoHead) {
  if (typeof document === "undefined") return;

  document.title = head.title;
  for (const existing of Array.from(document.head.querySelectorAll(`[${MANAGED_ATTR}="1"]`))) {
    existing.remove();
  }

  for (const tag of head.tags) {
    const el = document.createElement(tag.type);
    for (const [key, value] of Object.entries(tag.attrs)) {
      el.setAttribute(key, value);
    }
    if (tag.type === "script") {
      el.textContent = tag.content;
    }
    document.head.appendChild(el);
  }
}
