import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },

  /**
   * The app lives in `frontend/`, not at the repository root.
   *
   * Without this, Next.js walks up looking for a workspace root while
   * collecting build traces and can pull in - or trip over - files outside the
   * app. Pinning the trace root to this folder keeps the output self-contained
   * and is the usual fix for a build that compiles cleanly and then fails at
   * "Collecting build traces".
   */
  outputFileTracingRoot: __dirname,

  experimental: {
    // Tree-shake icon imports instead of pulling the whole library into every
    // route. Cuts the module count the dev server has to compile.
    optimizePackageImports: ["lucide-react", "@supabase/supabase-js"],
  },

  poweredByHeader: false,
};

export default nextConfig;
