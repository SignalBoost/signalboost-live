/** @type {import('next').NextConfig} */
const nextConfig = {
  /* This forces Next.js 16 to ignore legacy middleware detection */
  skipMiddlewareUrlNormalize: true,
  /* Disable any experimental features that might trigger the proxy/middleware check */
  experimental: {}
};

export default nextConfig;
