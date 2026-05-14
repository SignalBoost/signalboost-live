/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Optional: Vercel build ignore patterns
  experimental: {
    serverActions: {
      allowedOrigins: ["*"],
    },
  },
};

module.exports = nextConfig;
