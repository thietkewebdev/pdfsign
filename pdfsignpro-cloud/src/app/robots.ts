import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/d/", "/api/"],
      },
    ],
    sitemap: "https://pdfsign.vn/sitemap.xml",
  };
}
