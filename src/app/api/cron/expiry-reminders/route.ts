import { NextResponse } from "next/server";
import { apiError, HTTP_STATUS } from "@/lib/api/envelope";
import { runExpiryJob } from "@/lib/cron/expiry-job";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const authHeader = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return apiError(
      "INTERNAL_ERROR",
      "CRON_SECRET manquant — configurez la variable d'environnement.",
      HTTP_STATUS.INTERNAL
    );
  }
  if (authHeader !== `Bearer ${secret}`) {
    return apiError("UNAUTHORIZED", "Non autorisé.", HTTP_STATUS.UNAUTHORIZED);
  }

  const result = await runExpiryJob();
  return NextResponse.json(result, { status: HTTP_STATUS.OK });
}
