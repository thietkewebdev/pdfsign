import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Calendar, Clock } from "lucide-react";
import { getPostBySlug, getAllSlugs, BLOG_POSTS } from "@/lib/blog-data";
import { MarkdownContent } from "./markdown-content";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return getAllSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) return {};

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://pdfsign.vn";

  return {
    title: post.title,
    description: post.description,
    alternates: {
      canonical: `${baseUrl}/blog/${post.slug}`,
    },
    openGraph: {
      title: post.title,
      description: post.description,
      type: "article",
      publishedTime: post.date,
    },
  };
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) notFound();

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://pdfsign.vn";

  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    author: {
      "@type": "Organization",
      name: "PDFSignPro Cloud",
      url: baseUrl,
    },
    publisher: {
      "@type": "Organization",
      name: "PDFSignPro Cloud",
      url: baseUrl,
    },
    mainEntityOfPage: `${baseUrl}/blog/${post.slug}`,
  };

  const currentIndex = BLOG_POSTS.findIndex((p) => p.slug === slug);
  const relatedPosts = BLOG_POSTS.filter((_, i) => i !== currentIndex).slice(0, 3);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
      />
      <article className="container mx-auto max-w-3xl px-6 py-12 sm:py-16">
        <Link
          href="/blog"
          className="mb-8 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-3.5" />
          Tất cả bài viết
        </Link>

        <header className="mb-10">
          <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="rounded-md bg-primary/10 px-2 py-0.5 font-medium text-primary">
              {post.category}
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="size-3" />
              {new Date(post.date).toLocaleDateString("vi-VN", {
                day: "2-digit",
                month: "long",
                year: "numeric",
              })}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="size-3" />
              {post.readingTime}
            </span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            {post.title}
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            {post.description}
          </p>
        </header>

        <MarkdownContent content={post.content} />

        {relatedPosts.length > 0 && (
          <aside className="mt-16 border-t border-border pt-10">
            <h2 className="mb-6 text-lg font-semibold">Bài viết liên quan</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {relatedPosts.map((related) => (
                <Link
                  key={related.slug}
                  href={`/blog/${related.slug}`}
                  className="group rounded-lg border border-border p-4 transition-colors hover:bg-muted/50"
                >
                  <span className="mb-1 block text-xs text-muted-foreground">
                    {related.category}
                  </span>
                  <span className="text-sm font-medium group-hover:text-primary transition-colors line-clamp-2">
                    {related.title}
                  </span>
                </Link>
              ))}
            </div>
          </aside>
        )}
      </article>
    </>
  );
}
