const nextConfig = {
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        fs: false,
        dns: false,
        net: false,
        tls: false,
        child_process: false,
        util: false,
        'util/types': false,
      };
    }
    return config;
  },
};

module.exports = nextConfig;
