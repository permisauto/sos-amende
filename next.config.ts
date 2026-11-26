/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: { ignoreBuildErrors: true },

  // 1. Exclut Prisma et l'adaptateur DB de la compilation client
  serverExternalPackages: [
    '@prisma/client',
    '@prisma/adapter-pg',
    'pg',
    'ioredis',
    '@/prisma/generated-client'
  ],

  // 2. Output standalone uniquement pour Docker (le Dockerfile pose
  //    NEXT_OUTPUT=standalone). `next start` local/E2E refuse ce mode.
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,

  // 3. Traçage forcé du polyfill canvas (chargé dynamiquement par pdf-parse/
  //    pdfjs-dist pour DOMMatrix) : sans lui, la lecture locale de la couche
  //    texte d'un PDF échoue en prod Vercel (ReferenceError: DOMMatrix is not
  //    defined) et retombe sur la Files API Gemini. On embarque le wrapper JS
  //    ET les binaires natifs (win32 en local, linux-x64-gnu en prod).
  outputFileTracingIncludes: {
    '/**': [
      './node_modules/@napi-rs/canvas/**/*',
      './node_modules/@napi-rs/canvas-*/**/*',
    ],
  },

  // 4. Fallbacks de secours si Webpack est appelé en parallèle
  webpack: (
    config: { resolve: { fallback?: Record<string, unknown>; alias: Record<string, unknown> } },
    { isServer }: { isServer?: boolean },
  ) => {
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