/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'signalboostapp.com',
        // Narrow the allowlist to the asset path only, so the image optimizer
        // can't be pointed at arbitrary (or user-controlled) paths on the host.
        pathname: '/images/**',
      },
    ],
  },
}

export default nextConfig
