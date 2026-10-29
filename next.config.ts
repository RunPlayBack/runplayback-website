import type { NextConfig } from "next";
import { redirects } from "./lib/redirects";

const nextConfig: NextConfig = {
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
  async redirects() {
    return redirects;
  },
};

export default nextConfig;
