import { NextRequest, NextResponse } from "next/server";
import { consommerCreneau } from "@/lib/rate-limit";

/**
 * Rate limiting pour les endpoints d'authentification NextAuth
 * Protège : /api/auth/signin, /api/auth/callback, /api/auth/csrf, etc.
 */

const AUTH_RATE_LIMITS = {
  // Limites par défaut pour les endpoints sensibles
  default: { max: 10, windowMs: 15 * 60 * 1000 }, // 10 req / 15 min
  signin: { max: 5, windowMs: 15 * 60 * 1000 },   // 5 req / 15 min pour signin
  callback: { max: 10, windowMs: 15 * 60 * 1000 },
};

export async function authRateLimit(req: Request): Promise<NextResponse | null> {
  const url = new URL(req.url);
  const pathname = url.pathname;
  
  // Extraire l'action NextAuth (signin, callback, csrf, etc.)
  const actionMatch = pathname.match(/\/api\/auth\/(\w+)/);
  const action = actionMatch?.[1] || "default";
  
  const limits = AUTH_RATE_LIMITS[action as keyof typeof AUTH_RATE_LIMITS] || AUTH_RATE_LIMITS.default;
  
  // Clé basée sur l'IP (x-forwarded-for) + action
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const key = `auth:${action}:${ip}`;
  
  const remaining = await consommerCreneau(key, limits.max, limits.windowMs);
  
  if (remaining <= 0) {
    return new NextResponse(
      JSON.stringify({ 
        error: "Trop de tentatives d'authentification. Attendez quelques minutes." 
      }),
      { 
        status: 429, 
        headers: { 
          "Content-Type": "application/json",
          "Retry-After": Math.ceil(limits.windowMs / 1000).toString()
        } 
      }
    );
  }
  
  return null; // Pas de limite atteinte
}

/**
 * Middleware wrapper pour NextAuth qui ajoute le rate limiting
 */
export function withAuthRateLimit(
  handler: (req: NextRequest) => Promise<Response>,
) {
  return async (req: NextRequest) => {
    const rateLimitResponse = await authRateLimit(req);
    if (rateLimitResponse) return rateLimitResponse;
    return handler(req);
  };
}