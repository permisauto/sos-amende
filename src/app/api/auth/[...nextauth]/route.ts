import { handlers } from "@/auth";
import { withAuthRateLimit } from "@/lib/auth-rate-limit";

const { GET: nextAuthGET, POST: nextAuthPOST } = handlers;

export const GET = withAuthRateLimit(nextAuthGET);
export const POST = withAuthRateLimit(nextAuthPOST);
