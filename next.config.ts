const path = require('path');


/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        fs: false, dns: false, net: false, tls: false, child_process: false, util: false,
      };
      config.resolve.alias['util/types'] = false;
    }
    return config;
  },
};


module.exports = nextConfig;
