import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Turbopack mặc định đôi khi lấy nhầm root = thư mục repo cha → không resolve được `tailwindcss`. */
const appRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  turbopack: {
    root: appRoot,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
    ],
  },
};

export default nextConfig;
