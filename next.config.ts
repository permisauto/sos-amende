import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // Strict-Transport-Security n'a d'effet que sur HTTPS (Vercel/Hostinger) —
  // sans risque pour le dev local en HTTP.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  // CSP : pas de script inline généré par nous (Next.js APP Router inclut les
  // scripts NextJS en 'unsafe-inline' — impossible de s'en passer sans nonce).
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  // tesseract.js charge un worker-script via worker_threads à l'exécution :
  // il doit rester un paquet externe (require() natif), sinon Next.js le
  // bundle et le chemin 'tesseract.js/src/worker-script/node/index.js' casse
  // au déploiement (Vercel) : « Cannot find module .../worker-script/... ».
  serverExternalPackages: ["tesseract.js"],
  // Vercel trace la fonction et n'embarque que les fichiers atteignables par
  // analyse statique : le worker-script de tesseract.js est chargé via un
  // chemin dynamique (path.join(__dirname, ...)) donc invisible au traceur —
  // il faut le forcer dans l'output, sinon « Cannot find module
  // .../worker-script/node/index.js » en production.
  outputFileTracingIncludes: {
    "/*": [
      "./node_modules/tesseract.js/src/worker-script/**/*",
      "./node_modules/tesseract.js/src/worker/**/*",
      "./node_modules/tesseract.js-core/**/*",
      "./node_modules/tesseract.js/src/worker-script/node/index.js",
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;