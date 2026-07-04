import { NextResponse } from "next/server";
import { apiError, HTTP_STATUS } from "@/lib/api/envelope";
import { checkCheckoutRateLimit } from "@/lib/stripe/checkout-rate-limit";
import { createCheckoutSession, CreateCheckoutSessionError } from "@/lib/stripe/create-checkout-session";
import { createCheckoutSessionSchema } from "@/lib/validation/checkout";

function clientIp(req: Request): string {
  const forwardedFor = req.headers.get("x-forwarded-for");
  return forwardedFor?.split(",")[0]?.trim() ?? "unknown";
}

// PUBLIC route — no session required, visitors are not authenticated yet.
// Rate-limited by IP to prevent abuse of Stripe Checkout Session creation.
export async function POST(req: Request): Promise<NextResponse> {
  const ip = clientIp(req);
  if (!checkCheckoutRateLimit(ip)) {
    return apiError("RATE_LIMITED", "Trop de tentatives. Réessayez plus tard.", HTTP_STATUS.RATE_LIMITED);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("VALIDATION_FAILED", "Corps de requête JSON invalide.", HTTP_STATUS.BAD_REQUEST);
  }

  const parsed = createCheckoutSessionSchema.safeParse(body);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.join(".");
      if (path) fields[path] = issue.message;
    }
    return apiError("VALIDATION_FAILED", "Données invalides.", HTTP_STATUS.BAD_REQUEST, fields);
  }

  try {
    const result = await createCheckoutSession(parsed.data);
    return NextResponse.json(result, { status: HTTP_STATUS.OK });
  } catch (err) {
    if (err instanceof CreateCheckoutSessionError) {
      console.error("createCheckoutSession failed:", err.code, err.message);
    } else {
      console.error("createCheckoutSession failed:", err instanceof Error ? err.message : "unknown");
    }
    return apiError(
      "INTERNAL_ERROR",
      "Impossible de créer la session de paiement.",
      HTTP_STATUS.INTERNAL
    );
  }
}
