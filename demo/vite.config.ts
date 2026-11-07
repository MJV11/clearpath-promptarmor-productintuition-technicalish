import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { pathToFileURL } from "node:url";
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { artifacts } from "./src/content";

const compareModuleUrl = pathToFileURL(path.resolve("server/compare.mjs")).href;

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

interface ModelEnv {
  apiKey: string;
  model: string;
}

function compareApi(env: ModelEnv): Plugin {
  return {
    name: "compare-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split("?")[0];
        if (url !== "/api/compare" || req.method !== "POST") {
          next();
          return;
        }
        await handleCompare(req, res, env);
      });
    },
  };
}

async function handleCompare(req: IncomingMessage, res: ServerResponse, env: ModelEnv) {
  try {
    const body = JSON.parse(await readBody(req)) as {
      artifactId?: string;
      location?: string;
      deliveryDate?: string;
      domain?: string;
    };
    const campaign = artifacts.find((artifact) => artifact.id === body.artifactId && artifact.kind === "campaign");
    const standard = artifacts.find((artifact) => artifact.id === "standard");
    if (!campaign || !standard || !body.location || !body.deliveryDate || !body.domain) {
      res.statusCode = 400;
      res.end("Choose a campaign, location, delivery date, and domain.");
      return;
    }

    const { compareCampaign } = await import(compareModuleUrl);
    const result = await compareCampaign({
      standardTitle: standard.title,
      standardText: standard.body,
      campaignTitle: campaign.title,
      campaignText: campaign.body,
      location: body.location,
      deliveryDate: body.deliveryDate,
      domain: body.domain,
      apiKey: env.apiKey,
      model: env.model,
    });
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(result));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Comparison failed";
    const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : "";
    res.statusCode = 500;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end(
      message === "fetch failed"
        ? "Could not reach OpenRouter. Run the dev server with network access, then submit again."
        : cause
          ? `${message}: ${cause}`
          : message,
    );
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "OPENROUTER_");
  return {
    plugins: [
      react(),
      compareApi({
        apiKey: env.OPENROUTER_API_KEY ?? "",
        model: env.OPENROUTER_MODEL || "nvidia/nemotron-3.5-super-vl:free",
      }),
    ],
    server: {
      port: 5173,
      watch: {
        ignored: ["**/.cache/**", "**/.env*"],
      },
    },
  };
});
