import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  images: {
    unoptimized: true,
  },
  experimental: {
    devtoolSegmentExplorer: false,
  },
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
