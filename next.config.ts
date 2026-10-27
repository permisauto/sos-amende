/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },

  // Désactive explicitement Turbopack pour Vercel
  productionBrowserSourceMaps: false,

  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Dit à Webpack de remplacer tous ces modules par du vide côté client
      config.resolve.fallback = {
        fs: false,
        dns: false,
        net: false,
        tls: false,
        child_process: false,
        util: false,
      };
      // Court-circuite complètement l'importation de Prisma côté client
      config.resolve.alias['util/types'] = false;
      config.resolve.alias['@/prisma/generated-client'] = false;
    }
    return config;
  },
};

module.exports = nextConfig;
