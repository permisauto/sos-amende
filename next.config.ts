/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  serverExternalPackages: [
    '@prisma/client',
    '@prisma/adapter-pg',
    'pg',
    './prisma/generated-client'
  ],
  experimental: {
    turbopack: {},
  },
};
module.exports = nextConfig;
