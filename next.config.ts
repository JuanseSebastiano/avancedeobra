import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // las planillas xlsx pesan ~1-2 MB
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
