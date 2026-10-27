/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },

  serverExternalPackages: ['@prisma/client', '@prisma/adapter-pg', 'pg'],

  experimental: {
    turbopack: {
      // Force Turbopack à résoudre cet alias par un module vide côté client
      resolveAlias: {
        '@/prisma/generated-client': false,
        'util/types': false
      }
    }
  }
};

module.exports = nextConfig;
