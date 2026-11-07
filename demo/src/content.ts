import type { Artifact } from "./types";

export const REQUIRED_DISCLOSURE =
  "Rates range from 6.99% to 35.99% APR for qualified borrowers. Approval is subject to credit review. An origination fee of 1%–8% may apply. This is not a commitment to lend.";

export const CALIFORNIA_LINE =
  "Loans arranged pursuant to California Financing Law.";

export const standardBody = [
  "Effective 1 January 2026. Owner: Marketing Compliance. Fictional sample terms for this demo.",
  "",
  "Personal-loan advertising is checked against this document.",
  "",
  "Amounts run from $2,000 to $40,000. Repayment terms run from 24 to 60 months.",
  "",
  'The approved APR range is 6.99% to 35.99%, and only for qualified borrowers. Any "rates as low as" claim has to stay inside that range and include the phrase "for qualified borrowers."',
  "",
  "The origination fee is 1%–8% of the loan amount. Copy may not claim there is no fee.",
  "",
  "These claims are not approved: guaranteed approval, everyone qualifies, instant approval, no fees, no hidden fees, lowest rates, save thousands, and any wording that tells the reader the loan is already approved or that the money is already theirs.",
  "",
  "Every asset includes this disclosure, verbatim:",
  "",
  REQUIRED_DISCLOSURE,
  "",
  "California placements also include:",
  "",
  CALIFORNIA_LINE,
  "",
  "Do not use a promotional rate tied to a date before 2026.",
  "",
  "This standard covers the personal loan domain only.",
].join("\n");

export const passingBody = [
  "Personal loans from 6.99% APR for qualified borrowers.",
  "",
  "Borrow $2,000 to $40,000 over 24 to 60 months. Rates as low as 6.99% APR for qualified borrowers, with rates up to 35.99% APR. An origination fee of 1%–8% of the loan amount may apply. Approval depends on a credit review.",
  "",
  REQUIRED_DISCLOSURE,
  "",
  CALIFORNIA_LINE,
].join("\n");

export const failingBody = [
  "Get a personal loan today.",
  "",
  "Guaranteed approval. Everyone qualifies. Instant approval — apply in sixty seconds. Your loan is approved the moment you click, and the money is yours.",
  "",
  "The lowest rates in the market. Save thousands against your current lender.",
  "",
  "Promotional 0% APR through March 2024, then 4.99% APR.",
  "",
  "No fees. No hidden fees.",
].join("\n");

export const artifacts: Artifact[] = [
  {
    id: "standard",
    kind: "reference",
    expectation: "reference",
    title: "Personal Loan Advertising Standard",
    channel: "Reference",
    body: standardBody,
  },
  {
    id: "fall-clearrate",
    kind: "campaign",
    expectation: "pass",
    title: "Fall ClearRate",
    channel: "Search ad",
    body: passingBody,
  },
  {
    id: "fastcash",
    kind: "campaign",
    expectation: "fail",
    title: "FastCash Spring",
    channel: "Landing page",
    body: failingBody,
  },
];
