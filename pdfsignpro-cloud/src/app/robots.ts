import type { MetadataRoute } from "next";

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://pdfsign.vn";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/d/", "/sign/", "/api/", "/dashboard", "/contract/"],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
