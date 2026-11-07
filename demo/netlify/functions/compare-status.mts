import type { Config, Context } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

const STALE_AFTER_MS = 10 * 60 * 1000;

export default async (_req: Request, context: Context) => {
  const jobId = context.params.id ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) {
    return new Response("Unknown comparison.", { status: 400 });
  }

  const jobs = getStore({ name: "compare-jobs", consistency: "strong" });
  const job = (await jobs.get(jobId, { type: "json" })) as { status?: string; createdAt?: number } | null;
  if (!job) return new Response("That comparison was not found.", { status: 404 });

  const unfinished = job.status === "pending" || job.status === "running";
  if (unfinished && job.createdAt && Date.now() - job.createdAt > STALE_AFTER_MS) {
    return Response.json(
      { status: "error", error: "The comparison did not finish. Submit again." },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  return Response.json(job, { headers: { "Cache-Control": "no-store" } });
};

export const config: Config = {
  path: "/api/compare/:id",
  method: "GET",
};
