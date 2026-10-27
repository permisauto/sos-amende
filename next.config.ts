const path = require('path');


/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Résolution des modules natifs encombrants
      config.resolve.fallback = {
        fs: false,
        dns: false,
        net: false,
        tls: false,
        child_process: false,
        util: false,
      };
      
      // Force Webpack à remplacer l'import 'util/types' par un objet vide
      config.resolve.alias['util/types'] = false;
    }
    return config;
  },
};


module.exports = nextConfig;
