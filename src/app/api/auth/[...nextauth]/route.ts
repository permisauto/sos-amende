import { handlers } from "@/auth";
import { withAuthRateLimit } from "@/lib/auth-rate-limit";

const { GET: nextAuthGET, POST: nextAuthPOST } = handlers;

export const GET = withAuthRateLimit(async (req: Request) => nextAuthGET(req));
export const POST = withAuthRateLimit(async (req: Request) => nextAuthPOST(req));
