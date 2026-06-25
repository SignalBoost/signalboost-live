/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'signalboostapp.com',
        // Pin the default HTTPS port so alternate ports on the host can't be
        // reached through the optimizer.
        port: '',
        // Narrow the allowlist to the asset path only, so the image optimizer
        // can't be pointed at arbitrary (or user-controlled) paths on the host.
        pathname: '/images/**',
        // No query strings: these are static assets and never use them, so a
        // query string can't drive redirect/proxy/dynamic behavior on the host.
        search: '',
      },
    ],
  },
}

export default nextConfig
