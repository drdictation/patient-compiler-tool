import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Increase body size limit for audio file uploads (25 MB)
  experimental: {
    serverActions: {
      bodySizeLimit: '25mb',
    },
  },
};

export default nextConfig;
