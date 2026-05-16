/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'signalboostapp.com',
      },
    ],
  },
  webpack: (config) => {
    config.watchOptions = {
      ignored: /saas\/node_modules/,
    };
    return config;
  },
}
export default nextConfig
