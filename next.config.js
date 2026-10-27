/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  serverExternalPackages: ['@prisma/client', 'pg', '@/prisma/generated-client', '@/generated/prisma/client'],
  experimental: {
    turbopack: {},
  },
};
module.exports = nextConfig;
