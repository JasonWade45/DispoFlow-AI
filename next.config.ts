import type { NextConfig } from "next";

const sandboxId = process.env.E2B_SANDBOX_ID;

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    agentUpgrade: "security",
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  ...(sandboxId
    ? {
        allowedDevOrigins: [`3000-${sandboxId}.e2b.app`],
      }
    : {}),
};

export default nextConfig;
