/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['openai'],
  // Ensure the build can find the Tailwind config if it's in the same folder
  experimental: {
    turbo: {
      rules: {
        '*.css': ['postcss-loader'],
      },
    },
  },
};

export default nextConfig;
