export const LOCATIONS = ["California", "New York", "Texas", "National"] as const;
export type Location = (typeof LOCATIONS)[number];

export const DOMAINS = [
  "Personal loan",
  "Credit card",
  "Mortgage prequalification",
] as const;
export type DomainType = (typeof DOMAINS)[number];

export interface Highlight {
  start: number;
  end: number;
  quote: string;
}

export interface Finding {
  ruleId: string;
  label: string;
  explanation: string;
  detail?: string;
  highlights: Highlight[];
  suggestedAction: string;
}

export interface Artifact {
  id: string;
  kind: "reference" | "campaign";
  expectation: "reference" | "pass" | "fail";
  title: string;
  channel: string;
  body: string;
}

export interface SubmissionContext {
  location: Location;
  deliveryDate: string;
  domain: DomainType;
}

export interface Submission extends SubmissionContext {
  id: string;
  artifactId: string;
  submittedAt: number;
  note: string;
  findings: Finding[];
  approvedAt?: number;
}
