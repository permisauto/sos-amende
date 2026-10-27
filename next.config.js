/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },

  // 1. Exclut Prisma et l'adaptateur DB de la compilation client
  serverExternalPackages: [
    '@prisma/client',
    '@prisma/adapter-pg',
    'pg',
    '@/prisma/generated-client'
  ],

  experimental: {
    // 2. REND L'ERREUR DE CONFLIT SILENCIEUSE POUR TURBOPACK
    turbopack: {},
  },

  // 3. Fallbacks de secours si Webpack est appelé en parallèle
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        fs: false, dns: false, net: false, tls: false, child_process: false, util: false,
      };
      config.resolve.alias['util/types'] = false;
      config.resolve.alias['@/prisma/generated-client'] = false;
    }
    return config;
  },
};

module.exports = nextConfig;
