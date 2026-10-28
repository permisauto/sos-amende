/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: { ignoreBuildErrors: true },
  serverExternalPackages: ['pg', '@prisma/adapter-pg', '@prisma/client'],
  turbopack: {},
};

module.exports = nextConfig;
