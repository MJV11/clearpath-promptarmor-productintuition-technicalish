import type { Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import { artifacts } from "../../src/content.ts";
import { buildCompareInput } from "../../server/compare.mjs";

export default async (req: Request) => {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response("Send the filing as JSON.", { status: 400 });
  }
  if (!buildCompareInput(body, artifacts, { apiKey: "", model: "" })) {
    return new Response("Choose a campaign, location, delivery date, and domain.", { status: 400 });
  }

  const jobId = crypto.randomUUID();
  const jobs = getStore({ name: "compare-jobs", consistency: "strong" });
  await jobs.setJSON(jobId, { status: "pending", createdAt: Date.now() });

  const run = await fetch(new URL("/api/compare-run", req.url), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jobId, request: body }),
  });
  if (run.status !== 202) {
    await jobs.setJSON(jobId, { status: "error", error: `The comparison could not start (${run.status}).` });
    return new Response(`The comparison could not start (${run.status}).`, { status: 502 });
  }

  return Response.json({ jobId }, { status: 202 });
};

export const config: Config = {
  path: "/api/compare",
  method: "POST",
};
