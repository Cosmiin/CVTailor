import { adminClient } from "../_shared/http.ts";
import { processJobParseQueue, reconcilePendingJobParses } from "../_shared/job-parse-finalizer.ts";

const response = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
});

const constantTimeEqual = (left: string, right: string) => {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  if (leftBytes.byteLength !== rightBytes.byteLength) return false;
  let difference = 0;
  for (let index = 0; index < leftBytes.byteLength; index += 1) difference |= leftBytes[index] ^ rightBytes[index];
  return difference === 0;
};

Deno.serve(async (request) => {
  if (request.method !== "POST") return response({ error: "method_not_allowed" }, 405);
  const expected = Deno.env.get("JOB_FINALIZER_SECRET") ?? "";
  const supplied = request.headers.get("x-job-finalizer-secret") ?? "";
  if (!expected || !supplied || !constantTimeEqual(expected, supplied)) {
    return response({ error: "authentication_required" }, 401);
  }

  try {
    const admin = adminClient();
    const queued = await processJobParseQueue(admin, 20);
    const reconciled = await reconcilePendingJobParses(admin, 20);
    return response({ processed: queued.length, reconciled: reconciled.length });
  } catch (error) {
    console.error("Scheduled job parse finalization failed", error);
    return response({ error: "job_parse_finalization_failed" }, 500);
  }
});
