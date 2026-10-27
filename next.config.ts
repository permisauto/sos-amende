/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },

  // 1. Liste les packages Node/Prisma pour empêcher Next.js de les compiler pour le client
  serverExternalPackages: ['@prisma/client', '@prisma/adapter-pg', 'pg'],

  experimental: {
    // 2. Déclare un objet turbopack pour rendre l'erreur de configuration silencieuse
    turbopack: {},
  },
};

module.exports = nextConfig;
