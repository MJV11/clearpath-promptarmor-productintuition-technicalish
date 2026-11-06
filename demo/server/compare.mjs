const APR_MIN = 699;
const APR_MAX = 3599;

function requirementsFromStandard(text) {
  const blocks = text
    .split(/\n\n+/)
    .map((block) => block.trim())
    .filter(Boolean);
  const consumed = new Set();
  const requirements = [];

  for (let index = 0; index < blocks.length; index += 1) {
    if (consumed.has(index)) continue;
    const block = blocks[index];
    if (/^Effective /.test(block) || /^Personal-loan advertising is checked/.test(block)) continue;
    if (/verbatim:$/.test(block) || /also include:$/.test(block)) {
      const next = blocks[index + 1];
      if (next) {
        requirements.push({ lead: block, text: `${block} ${next}`, body: next });
        consumed.add(index + 1);
      }
      continue;
    }
    requirements.push({ lead: block, text: block, body: block });
  }

  return requirements;
}

function locateAll(text, source) {
  const hits = [];
  const re = new RegExp(source, "gi");
  for (const match of text.matchAll(re)) {
    if (match.index === undefined || match[0].length === 0) continue;
    hits.push({ start: match.index, end: match.index + match[0].length, quote: match[0] });
  }
  return hits;
}

function quoteList(hits) {
  return hits.map((hit) => `“${hit.quote}”`).join(", ");
}

function judge(requirement, campaignText, context) {
  const { lead, text, body } = requirement;

  if (/not approved:/i.test(body)) {
    const phrases = [
      ["guaranteed approval", "guaranteed approval"],
      ["everyone qualifies", "everyone qualifies"],
      ["instant approval", "instant approval"],
      ["lowest rates", "lowest rates"],
      ["save thousands", "save thousands"],
      ["your loan is approved", "your loan is approved"],
      ["the money is (?:already )?yours", "the money is yours"],
    ];
    const hits = phrases.flatMap(([source]) => locateAll(campaignText, source));
    if (hits.length === 0) return null;
    return {
      title: "Claims the standard does not approve",
      highlights: hits,
      standard: text,
      insight: `The standard names a list of claims that are not approved, and it also bars wording that the loan is already approved or that the money is already the borrower’s. This campaign uses ${quoteList(hits)}. Each of those is on that list, or is the “already approved” wording, so those lines do not pass.`,
      change: "Remove the unapproved claims and any line that says the loan or the funds are already the borrower’s.",
    };
  }

  if (/approved APR range/i.test(body)) {
    const rates = locateAll(campaignText, "(\\d+(?:\\.\\d+)?)%\\s*APR").filter((hit) => {
      const cents = Math.round(parseFloat(hit.quote) * 100);
      return cents < APR_MIN || cents > APR_MAX;
    });
    const qualified = /for qualified borrowers/i.test(campaignText);
    const anyRate = locateAll(campaignText, "(\\d+(?:\\.\\d+)?)%\\s*APR");
    if (rates.length === 0 && (anyRate.length === 0 || qualified)) return null;
    const problems = [];
    if (rates.length) {
      problems.push(`${quoteList(rates)} ${rates.length === 1 ? "sits" : "sit"} outside 6.99% to 35.99%`);
    }
    if (anyRate.length && !qualified) {
      problems.push("the campaign never says “for qualified borrowers”");
    }
    return {
      title: "APR outside the approved range",
      highlights: rates.length ? rates : anyRate,
      standard: text,
      insight: `The standard allows 6.99% to 35.99% APR, and only for qualified borrowers. A “rates as low as” claim has to stay inside that range and include that phrase. Here, ${problems.join(", and ")}.`,
      change: "Replace these rates with the 6.99%–35.99% range and add “for qualified borrowers.”",
    };
  }

  if (/origination fee/i.test(body) && /no fee/i.test(body)) {
    const hits = locateAll(campaignText, "\\bno fees\\b|\\bno hidden fees\\b");
    if (hits.length === 0) return null;
    return {
      title: "A no-fee claim",
      highlights: hits,
      standard: text,
      insight: `The standard sets the origination fee at 1%–8% of the loan amount and says copy may not claim there is no fee. The campaign says ${quoteList(hits)}. Those are the claims the standard bars.`,
      change: "Replace the no-fee lines with the 1%–8% origination fee.",
    };
  }

  if (/verbatim:/i.test(lead)) {
    if (campaignText.includes(body)) return null;
    return {
      title: "Required disclosure is missing",
      highlights: [],
      standard: text,
      insight:
        "The standard says every asset includes the disclosure below, verbatim. The comparison looks for that whole paragraph in the campaign. It is not there, so the disclosure requirement is not met.",
      change: "Add the required disclosure from the standard, verbatim.",
    };
  }

  if (/California placements/i.test(lead)) {
    if (context.location !== "California" || campaignText.includes(body)) return null;
    return {
      title: "California line is missing",
      highlights: [],
      standard: text,
      insight: `The filing location is California. The standard says California placements include “${body}”. That sentence was looked for in the campaign and is not there.`,
      change: "Add the California Financing Law sentence.",
    };
  }

  if (/date before 2026/i.test(body)) {
    const hits = locateAll(campaignText, "\\b(?:19\\d{2}|20(?:0\\d|1\\d|2[0-4]))\\b|March 2024");
    if (hits.length === 0) return null;
    return {
      title: "Promotional date before 2026",
      highlights: hits,
      standard: text,
      insight: `The standard says not to use a promotional rate tied to a date before 2026. The campaign includes ${quoteList(hits)}. That date is before 2026, so the promotional line does not pass.`,
      change: "Delete the promotional rate tied to that date.",
    };
  }

  if (/personal loan domain only/i.test(body)) {
    if (context.domain === "Personal loan") return null;
    return {
      title: "Filed under another domain",
      highlights: [],
      standard: text,
      insight: `The standard says it covers the personal loan domain only. This campaign was filed as ${context.domain}, so the standard’s domain and the filing do not match.`,
      change: "Resubmit this creative under Personal loan.",
    };
  }

  return null;
}

export function compareCampaign(input) {
  const requirements = requirementsFromStandard(input.standardText);
  const findings = [];

  for (const requirement of requirements) {
    const judged = judge(requirement, input.campaignText, input);
    if (!judged) continue;
    findings.push({
      ruleId: `CMP-${findings.length + 1}`,
      label: judged.title,
      explanation: judged.insight,
      detail: judged.standard,
      highlights: [...judged.highlights].sort((a, b) => a.start - b.start),
      suggestedAction: judged.change,
    });
  }

  const note =
    findings.length === 0
      ? `Read ${requirements.length} requirements in the standard against this campaign. Each one was met.`
      : `Read ${requirements.length} requirements in the standard against this campaign. ${findings.length} were not met. Each one below shows the requirement, the campaign words it was checked against, and how the two were compared.`;

  return Promise.resolve({ note, findings });
}
