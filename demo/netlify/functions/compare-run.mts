import type { Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import { artifacts } from "../../src/content.ts";
import { buildCompareInput, compareCampaign } from "../../server/compare.mjs";

export default async (req: Request) => {
  const jobs = getStore({ name: "compare-jobs", consistency: "strong" });
  let jobId = "";

  try {
    const payload = (await req.json()) as { jobId?: unknown; request?: unknown };
    jobId = String(payload.jobId ?? "");
    const job = (await jobs.get(jobId, { type: "json" })) as { status?: string; createdAt?: number } | null;
    // Only a job created by compare-start and not yet picked up may run, so a direct call cannot spend model quota.
    if (!job || job.status !== "pending") {
      jobId = "";
      return;
    }
    await jobs.setJSON(jobId, { status: "running", createdAt: job.createdAt });

    const input = buildCompareInput(payload.request, artifacts, {
      apiKey: process.env.OPENROUTER_API_KEY ?? "",
      model: process.env.OPENROUTER_MODEL ?? "",
    });
    if (!input) throw new Error("Choose a campaign, location, delivery date, and domain.");

    const result = await compareCampaign(input);
    await jobs.setJSON(jobId, { status: "done", result });
  } catch (error) {
    if (!jobId) return;
    const message = error instanceof Error ? error.message : "Comparison failed";
    await jobs.setJSON(jobId, {
      status: "error",
      error: message === "fetch failed" ? "Could not reach OpenRouter. Submit again." : message,
    });
  }
};

export const config: Config = {
  background: true,
  path: "/api/compare-run",
  method: "POST",
};
