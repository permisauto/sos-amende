/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {},
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        fs: false, dns: false, net: false, tls: false, child_process: false, util: false,
      };
      config.resolve.alias['util/types'] = false;
      config.resolve.alias['@/generated/prisma/client'] = false;
    }
    return config;
  },
};
module.exports = nextConfig;
