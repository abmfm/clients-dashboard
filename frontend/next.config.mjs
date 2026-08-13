/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },

  experimental: {
    // Tree-shake icon imports instead of pulling the whole library into every
    // route. Cuts the module count the dev server has to compile.
    optimizePackageImports: ["lucide-react", "@supabase/supabase-js"],
  },

  // Static assets and the build manifest are immutable - let the browser keep them.
  poweredByHeader: false,
};

export default nextConfig;
