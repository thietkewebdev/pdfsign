import type { Metadata } from "next";
import Link from "next/link";
import { Calendar, Clock, ArrowRight } from "lucide-react";
import { BLOG_POSTS } from "@/lib/blog-data";

export const metadata: Metadata = {
  title: "Blog & Hướng dẫn",
  description:
    "Hướng dẫn ký số PDF, kiến thức chữ ký số, mẹo sử dụng USB Token và PDFSignPro Cloud.",
};

function BlogCover({
  emoji,
  gradient,
  className,
}: {
  emoji: string;
  gradient: [string, string];
  className?: string;
}) {
  return (
    <div
      className={`flex items-center justify-center rounded-lg ${className ?? ""}`}
      style={{
        background: `linear-gradient(135deg, ${gradient[0]}, ${gradient[1]})`,
      }}
    >
      <span className="text-4xl">{emoji}</span>
    </div>
  );
}

export default function BlogPage() {
  const [featured, ...rest] = BLOG_POSTS;

  return (
    <div className="container mx-auto max-w-5xl px-6 py-12 sm:py-16">
      <div className="mb-12 text-center">
        <h1 className="mb-3 text-3xl font-bold tracking-tight sm:text-4xl">
          Blog & Hướng dẫn
        </h1>
        <p className="text-muted-foreground">
          Kiến thức chữ ký số, hướng dẫn sử dụng PDFSignPro Cloud
        </p>
      </div>

      {/* Featured post */}
      <Link href={`/blog/${featured.slug}`} className="group mb-10 block">
        <article className="overflow-hidden rounded-xl border border-border bg-card transition-colors hover:bg-muted/50">
          <BlogCover
            emoji={featured.emoji}
            gradient={featured.gradient}
            className="h-48 sm:h-64"
          />
          <div className="p-6">
            <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span className="rounded-md bg-primary/10 px-2 py-0.5 font-medium text-primary">
                {featured.category}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="size-3" />
                {new Date(featured.date).toLocaleDateString("vi-VN")}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="size-3" />
                {featured.readingTime}
              </span>
            </div>
            <h2 className="mb-2 text-xl font-semibold group-hover:text-primary transition-colors sm:text-2xl">
              {featured.title}
            </h2>
            <p className="text-sm text-muted-foreground">
              {featured.description}
            </p>
          </div>
        </article>
      </Link>

      {/* Rest */}
      <div className="grid gap-6 sm:grid-cols-2">
        {rest.map((post) => (
          <Link key={post.slug} href={`/blog/${post.slug}`} className="group">
            <article className="overflow-hidden rounded-xl border border-border bg-card transition-colors hover:bg-muted/50 h-full flex flex-col">
              <BlogCover
                emoji={post.emoji}
                gradient={post.gradient}
                className="h-36"
              />
              <div className="flex flex-1 flex-col p-5">
                <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="rounded-md bg-primary/10 px-2 py-0.5 font-medium text-primary">
                    {post.category}
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar className="size-3" />
                    {new Date(post.date).toLocaleDateString("vi-VN")}
                  </span>
                </div>
                <h2 className="mb-2 font-semibold group-hover:text-primary transition-colors line-clamp-2">
                  {post.title}
                </h2>
                <p className="mb-4 flex-1 text-sm text-muted-foreground line-clamp-2">
                  {post.description}
                </p>
                <span className="inline-flex items-center gap-1 text-sm font-medium text-primary">
                  Đọc tiếp
                  <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" />
                </span>
              </div>
            </article>
          </Link>
        ))}
      </div>
    </div>
  );
}
