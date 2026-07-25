import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root to this project so Next.js does not get confused by
  // other lockfiles higher up the filesystem (e.g. under the user's home dir).
  turbopack: {
    root: path.join(__dirname),
  },
  // better-sqlite3 is a native module - keep it external to the server bundle.
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
