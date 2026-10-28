/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: { ignoreBuildErrors: true },
  serverExternalPackages: ['pg', '@prisma/adapter-pg', '@prisma/client'],
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
