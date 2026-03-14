import type { Metadata } from "next";
import Link from "next/link";
import { Calendar, Clock, ArrowRight } from "lucide-react";
import { BLOG_POSTS } from "@/lib/blog-data";

export const metadata: Metadata = {
  title: "Blog & Hướng dẫn",
  description:
    "Hướng dẫn ký số PDF, kiến thức chữ ký số, mẹo sử dụng USB Token và PDFSignPro Cloud.",
};

export default function BlogPage() {
  return (
    <div className="container mx-auto max-w-4xl px-6 py-12 sm:py-16">
      <div className="mb-12 text-center">
        <h1 className="mb-3 text-3xl font-bold tracking-tight sm:text-4xl">
          Blog & Hướng dẫn
        </h1>
        <p className="text-muted-foreground">
          Kiến thức chữ ký số, hướng dẫn sử dụng PDFSignPro Cloud
        </p>
      </div>

      <div className="grid gap-6">
        {BLOG_POSTS.map((post) => (
          <Link key={post.slug} href={`/blog/${post.slug}`}>
            <article className="group rounded-xl border border-border bg-card p-6 transition-colors hover:bg-muted/50">
              <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span className="rounded-md bg-primary/10 px-2 py-0.5 font-medium text-primary">
                  {post.category}
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="size-3" />
                  {new Date(post.date).toLocaleDateString("vi-VN", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                  })}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="size-3" />
                  {post.readingTime}
                </span>
              </div>
              <h2 className="mb-2 text-lg font-semibold group-hover:text-primary transition-colors">
                {post.title}
              </h2>
              <p className="mb-4 text-sm text-muted-foreground line-clamp-2">
                {post.description}
              </p>
              <span className="inline-flex items-center gap-1 text-sm font-medium text-primary">
                Đọc tiếp
                <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" />
              </span>
            </article>
          </Link>
        ))}
      </div>
    </div>
  );
}
