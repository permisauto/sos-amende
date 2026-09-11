import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://recours-permis-pv.com";
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/dashboard/", "/api/", "/mock-antai", "/mock-stripe"] }],
    sitemap: `${base}/sitemap.xml`,
  };
}
