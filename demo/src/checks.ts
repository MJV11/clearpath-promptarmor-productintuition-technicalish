import { CALIFORNIA_LINE, failingBody, passingBody, REQUIRED_DISCLOSURE } from "./content";
import type { DomainType, Finding, Highlight, Location } from "./types";

const APR_MIN = 699;
const APR_MAX = 3599;

interface RuleHit {
  ruleId: string;
  label: string;
  explanation: string;
  detail?: string;
  highlights: Highlight[];
  suggestedAction: string;
}

function collect(text: string, source: string): Highlight[] {
  const hits: Highlight[] = [];
  for (const match of text.matchAll(new RegExp(source, "gi"))) {
    if (match.index === undefined || match[0].length === 0) continue;
    hits.push({
      start: match.index,
      end: match.index + match[0].length,
      quote: match[0],
    });
  }
  return hits;
}

function rateMentions(text: string): (Highlight & { cents: number })[] {
  const hits: (Highlight & { cents: number })[] = [];
  for (const match of text.matchAll(/(\d+(?:\.\d+)?)%\s*APR/gi)) {
    if (match.index === undefined) continue;
    hits.push({
      start: match.index,
      end: match.index + match[0].length,
      quote: match[0],
      cents: Math.round(Number(match[1]) * 100),
    });
  }
  return hits;
}

export function evaluate(
  text: string,
  context: { location: Location; domain: DomainType },
): Finding[] {
  const findings: RuleHit[] = [];

  const approval = collect(text, "guaranteed approval|everyone qualifies|instant approval");
  if (approval.length) {
    findings.push({
      ruleId: "APP-001",
      label: "Prohibited approval claim",
      explanation:
        "The standard bars guaranteed, universal, and instant approval.",
      highlights: approval,
      suggestedAction: "Remove guaranteed, universal, and instant approval language.",
    });
  }

  const decided = collect(text, "your loan is approved|the money is yours");
  if (decided.length) {
    findings.push({
      ruleId: "COMMIT-001",
      label: "States the loan is already decided",
      explanation:
        "The standard bars copy that says the loan is already approved or the funds are already the borrower's.",
      highlights: decided,
      suggestedAction:
        "Remove language that says the loan or the funds are already the borrower's.",
    });
  }

  const superiority = collect(text, "lowest rates|save thousands");
  if (superiority.length) {
    findings.push({
      ruleId: "SAV-001",
      label: "Unapproved superiority claim",
      explanation: 'The standard does not allow "lowest rates" or "save thousands."',
      highlights: superiority,
      suggestedAction: 'Remove "lowest rates" and "save thousands."',
    });
  }

  const fees = collect(text, "\\bno fees\\b|\\bno hidden fees\\b");
  if (fees.length) {
    findings.push({
      ruleId: "FEE-001",
      label: "Unapproved fee claim",
      explanation:
        "The standard sets an origination fee of 1%–8% and bars no-fee claims.",
      highlights: fees,
      suggestedAction: "Replace the no-fee lines with the 1%–8% origination fee.",
    });
  }

  const rates = rateMentions(text);
  const outside = rates.filter((rate) => rate.cents < APR_MIN || rate.cents > APR_MAX);
  if (outside.length) {
    findings.push({
      ruleId: "RATE-001",
      label: "APR outside the approved range",
      explanation: "The standard allows 6.99% to 35.99% APR. These claims sit outside it.",
      highlights: outside,
      suggestedAction: "Replace these rates with the approved 6.99%–35.99% range.",
    });
  }

  if (rates.length > 0 && !/for qualified borrowers/i.test(text)) {
    findings.push({
      ruleId: "QUAL-001",
      label: "Rate is missing its qualification",
      explanation:
        'A stated APR has to sit next to the phrase "for qualified borrowers."',
      highlights: rates,
      suggestedAction: 'Add "for qualified borrowers" beside every rate claim.',
    });
  }

  const expired = collect(text, "March 2024|\\b20(?:1\\d|2[0-4])\\b");
  if (expired.length) {
    findings.push({
      ruleId: "EXP-001",
      label: "Expired promotional date",
      explanation: "The standard bars a promotional rate tied to a date before 2026.",
      highlights: expired,
      suggestedAction: "Delete the expired promotional rate.",
    });
  }

  if (!text.includes(REQUIRED_DISCLOSURE)) {
    findings.push({
      ruleId: "DISC-001",
      label: "Required disclosure is missing",
      explanation: "The standard requires this paragraph, verbatim.",
      detail: REQUIRED_DISCLOSURE,
      highlights: [],
      suggestedAction: "Paste the required disclosure from the standard.",
    });
  }

  if (context.location === "California" && !text.includes(CALIFORNIA_LINE)) {
    findings.push({
      ruleId: "CA-001",
      label: "California line is missing",
      explanation: "California placements include this sentence.",
      detail: CALIFORNIA_LINE,
      highlights: [],
      suggestedAction: "Add the California Financing Law sentence.",
    });
  }

  if (context.domain !== "Personal loan") {
    findings.push({
      ruleId: "DOM-001",
      label: "Filed under another domain",
      explanation: `Filed as ${context.domain}. This creative is checked against the personal loan standard, so the filing domain needs to be Personal loan.`,
      highlights: [],
      suggestedAction: "Resubmit this creative under Personal loan.",
    });
  }

  return findings;
}

export function assertDemoFixtures(): void {
  const passEverywhere: Location[] = ["California", "New York", "Texas", "National"];
  for (const location of passEverywhere) {
    const findings = evaluate(passingBody, { location, domain: "Personal loan" });
    if (findings.length > 0) {
      throw new Error(
        `Fall ClearRate should pass for ${location}: ${findings.map((f) => f.ruleId).join(", ")}`,
      );
    }
  }

  const failNational = evaluate(failingBody, {
    location: "National",
    domain: "Personal loan",
  }).map((finding) => finding.ruleId);
  const expected = [
    "APP-001",
    "COMMIT-001",
    "SAV-001",
    "FEE-001",
    "RATE-001",
    "QUAL-001",
    "EXP-001",
    "DISC-001",
  ];
  if (failNational.join(",") !== expected.join(",")) {
    throw new Error(`FastCash filters were ${failNational.join(", ")}`);
  }

  const failCalifornia = evaluate(failingBody, {
    location: "California",
    domain: "Personal loan",
  }).map((finding) => finding.ruleId);
  if (!failCalifornia.includes("CA-001")) {
    throw new Error("FastCash should fail the California filter");
  }
}
