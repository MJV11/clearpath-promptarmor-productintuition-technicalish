const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const FALLBACK_MODELS = ["google/gemma-4-31b-it:free", "google/gemma-4-26b-a4b-it:free"];

function requirementsFromStandard(text) {
  const blocks = text
    .split(/\n\n+/)
    .map((block) => block.trim())
    .filter(Boolean);
  const requirements = [];

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    if (/^Effective /.test(block) || /^Personal-loan advertising is checked/.test(block)) continue;
    if (/:$/.test(block) && blocks[index + 1]) {
      requirements.push(`${block} ${blocks[index + 1]}`);
      index += 1;
      continue;
    }
    requirements.push(block);
  }

  return requirements.map((text, index) => ({ id: `R${index + 1}`, text }));
}

const SYSTEM_PROMPT = `You are a marketing compliance reviewer for a consumer lender. You compare one campaign against one advertising standard, requirement by requirement, and explain your reading so a marketer can fix the copy.

Rules:
- Judge every requirement you are given. Return exactly one result per requirement id, in order.
- A requirement is met unless the campaign text, read with the filing context, contradicts it or leaves out something it says must be present.
- Requirements that only apply to a location or domain are met when the filing context does not match that location or domain.
- The filing domain must match the domain the standard covers. Judge that requirement against the filing context, not the campaign copy.
- "quotes" are exact substrings copied character for character from the campaign text that caused the problem. Use [] when the problem is that something is missing, or when the requirement is met.
- "explanation" is two or three plain sentences: what the requirement asks, what the campaign does (quote it), and why that does or does not satisfy it. Name the specific numbers, phrases, or dates involved. Refer to the requirement as "the standard", never by its id. Do not restate these instructions.
- "change" is one concrete edit to the campaign that would satisfy the requirement. Use "" when met.
- "title" is a short label for the problem, under eight words, such as "APR outside the approved range". Use "Met" when met.
- Inside "explanation", "change", and "title", quote words with curly quotes “like this”, never straight double quotes.

Respond with JSON only, in this shape:
{"results":[{"id":"R1","met":true,"title":"Met","quotes":[],"explanation":"...","change":""}]}`;

const RESULT_SCHEMA = {
  name: "requirement_review",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["results"],
    properties: {
      results: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "met", "title", "quotes", "explanation", "change"],
          properties: {
            id: { type: "string" },
            met: { type: "boolean" },
            title: { type: "string" },
            quotes: { type: "array", items: { type: "string" } },
            explanation: { type: "string" },
            change: { type: "string" },
          },
        },
      },
    },
  },
};

function userPrompt(input, requirements) {
  return [
    `Standard: ${input.standardTitle}`,
    "",
    "Requirements:",
    ...requirements.map((requirement) => `${requirement.id}. ${requirement.text}`),
    "",
    "Filing context:",
    `- Location: ${input.location}`,
    `- Delivery date: ${input.deliveryDate}`,
    `- Domain: ${input.domain}`,
    "",
    `Campaign: ${input.campaignTitle}`,
    "<campaign>",
    input.campaignText,
    "</campaign>",
  ].join("\n");
}

function parseJson(content) {
  const trimmed = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "");
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("The model did not return JSON.");
  return JSON.parse(trimmed.slice(start, end + 1));
}

function locate(text, quote) {
  if (typeof quote !== "string" || quote.trim().length < 2) return null;
  const needle = quote.trim();
  let start = text.indexOf(needle);
  if (start === -1) start = text.toLowerCase().indexOf(needle.toLowerCase());
  if (start === -1) return null;
  return { start, end: start + needle.length, quote: text.slice(start, start + needle.length) };
}

function describeFailure(status, body) {
  let message = body;
  try {
    message = JSON.parse(body)?.error?.message ?? body;
  } catch {
    // Body was not JSON; keep the raw text.
  }
  if (status === 401) return "OpenRouter rejected the API key. Check OPENROUTER_API_KEY in demo/.env.local.";
  if (status === 402 || status === 403) {
    return `OpenRouter refused the request for this key: ${message} Use a :free model in OPENROUTER_MODEL or raise the key's limit.`;
  }
  if (status === 429) return "The free OpenRouter models are rate-limited right now. Wait a minute and submit again.";
  return `OpenRouter returned ${status}: ${message}`;
}

async function askModel({ apiKey, model }, input, requirements) {
  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "http://localhost:5173",
      "X-Title": "ClearPath Compliance Studio demo",
    },
    body: JSON.stringify({
      model,
      models: [model, ...FALLBACK_MODELS.filter((entry) => entry !== model)],
      temperature: 0,
      max_tokens: 8000,
      response_format: { type: "json_schema", json_schema: RESULT_SCHEMA },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt(input, requirements) },
      ],
    }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(describeFailure(response.status, text));
  const data = JSON.parse(text);
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("The model returned an empty answer. Submit again.");
  return { usedModel: data.model ?? model, parsed: parseJson(content) };
}

export async function compareCampaign(input) {
  if (!input.apiKey) {
    throw new Error("OPENROUTER_API_KEY is not set. Add it to demo/.env.local and restart npm run dev.");
  }
  const requirements = requirementsFromStandard(input.standardText);
  const settings = { apiKey: input.apiKey, model: input.model };
  let answer;
  try {
    answer = await askModel(settings, input, requirements);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    answer = await askModel(settings, input, requirements);
  }
  const { usedModel, parsed } = answer;

  const results = Array.isArray(parsed.results) ? parsed.results : [];
  const byId = new Map(results.map((result) => [String(result.id).trim(), result]));
  const missing = requirements.filter((requirement) => !byId.has(requirement.id));
  if (missing.length > 0) {
    throw new Error(`The model skipped ${missing.map((requirement) => requirement.id).join(", ")}. Submit again.`);
  }

  const findings = [];
  for (const requirement of requirements) {
    const result = byId.get(requirement.id);
    if (result.met === true) continue;
    const highlights = (Array.isArray(result.quotes) ? result.quotes : [])
      .map((quote) => locate(input.campaignText, quote))
      .filter(Boolean)
      .sort((a, b) => a.start - b.start);
    findings.push({
      ruleId: `CMP-${findings.length + 1}`,
      label: String(result.title || "Requirement not met"),
      explanation: String(result.explanation || ""),
      detail: requirement.text,
      highlights,
      suggestedAction: String(result.change || ""),
    });
  }

  const note =
    findings.length === 0
      ? `${usedModel} read ${requirements.length} requirements in the standard against this campaign. Each one was met.`
      : `${usedModel} read ${requirements.length} requirements in the standard against this campaign. ${findings.length} ${findings.length === 1 ? "was" : "were"} not met. Each one below shows the requirement, the campaign words it was checked against, and how the two were compared.`;

  return { note, findings, model: usedModel };
}
