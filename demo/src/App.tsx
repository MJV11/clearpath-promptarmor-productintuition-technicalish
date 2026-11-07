import { useMemo, useState, type DragEvent, type ReactNode } from "react";
import { artifacts } from "./content";
import {
  DOMAINS,
  LOCATIONS,
  type Artifact,
  type DomainType,
  type Finding,
  type Highlight,
  type Location,
  type Submission,
} from "./types";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const timeFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
});

function formatDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return iso;
  return dateFormatter.format(new Date(year, month - 1, day));
}

function mergeRanges(ranges: Highlight[]): Highlight[] {
  const sorted = [...ranges].sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: Highlight[] = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (last && range.start <= last.end) {
      last.end = Math.max(last.end, range.end);
      last.quote = "";
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}

function HighlightedText({
  text,
  ranges,
  variant,
}: {
  text: string;
  ranges: Highlight[];
  variant: "reference" | "campaign";
}) {
  const merged = mergeRanges(ranges);
  const nodes: ReactNode[] = [];
  let cursor = 0;
  merged.forEach((range, index) => {
    if (range.start > cursor) nodes.push(text.slice(cursor, range.start));
    nodes.push(<mark key={index}>{text.slice(range.start, range.end)}</mark>);
    cursor = range.end;
  });
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return <p className={`document ${variant}`}>{nodes}</p>;
}

function statusPhrase(entry: Submission): { tone: "pass" | "done" | "fail"; title: string } {
  if (entry.findings.length > 0) return { tone: "fail", title: "Changes required" };
  if (entry.approvedAt) return { tone: "pass", title: "Approved" };
  return { tone: "done", title: "Completed" };
}

type View = { kind: "artifact"; id: string } | { kind: "submission"; id: string };
type Perspective = "affiliate" | "compliance";

const standard = artifacts.find((artifact) => artifact.kind === "reference") ?? artifacts[0];
const campaigns = artifacts.filter((artifact) => artifact.kind === "campaign");

function artifactById(id: string): Artifact {
  return artifacts.find((artifact) => artifact.id === id) ?? standard;
}

export function App() {
  const [perspective, setPerspective] = useState<Perspective>("affiliate");
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [view, setView] = useState<View>({ kind: "artifact", id: standard.id });
  const [stagedId, setStagedId] = useState<string | null>(null);
  const [location, setLocation] = useState<Location>("California");
  const [deliveryDate, setDeliveryDate] = useState("2026-11-18");
  const [domain, setDomain] = useState<DomainType>("Personal loan");
  const [history, setHistory] = useState<Submission[]>([]);
  const [pending, setPending] = useState<Artifact | null>(null);
  const [compareError, setCompareError] = useState<string | null>(null);
  const [dropOver, setDropOver] = useState(false);

  const staged = stagedId ? artifactById(stagedId) : null;
  const submission =
    view.kind === "submission" ? history.find((entry) => entry.id === view.id) ?? null : null;
  const shown = submission ? artifactById(submission.artifactId) : artifactById(view.id);
  const comparing = pending !== null && view.kind === "artifact" && view.id === pending.id;
  const highlights = useMemo(
    () => submission?.findings.flatMap((finding) => finding.highlights) ?? [],
    [submission],
  );

  function approve(id: string) {
    setHistory((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, approvedAt: Date.now() } : entry)),
    );
  }

  function openArtifact(id: string) {
    setView({ kind: "artifact", id });
  }

  function stage(id: string) {
    if (!campaigns.some((artifact) => artifact.id === id)) return;
    setCompareError(null);
    setStagedId(id);
    openArtifact(id);
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDropOver(false);
    stage(event.dataTransfer.getData("text/plain"));
  }

  async function submit() {
    if (!staged || !deliveryDate || pending) return;
    const artifact = staged;
    const context = { location, deliveryDate, domain };
    setStagedId(null);
    setPending(artifact);
    setCompareError(null);
    openArtifact(artifact.id);
    try {
      const response = await fetch("/api/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artifactId: artifact.id, ...context }),
      });
      const text = await response.text();
      if (!response.ok) throw new Error(text || "Comparison failed");
      const result = JSON.parse(text) as { note: string; findings: Finding[] };
      const entry: Submission = {
        id: crypto.randomUUID(),
        artifactId: artifact.id,
        submittedAt: Date.now(),
        ...context,
        note: result.note,
        findings: result.findings,
      };
      setHistory((current) => [entry, ...current]);
      setView((current) =>
        current.kind === "artifact" && current.id === artifact.id
          ? { kind: "submission", id: entry.id }
          : current,
      );
    } catch (error) {
      setStagedId(artifact.id);
      setCompareError(error instanceof Error ? error.message : "Comparison failed");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <strong>ClearPath</strong>
          <span>Compliance Studio</span>
          <span className="demo-tag">Demo</span>
        </div>
      </header>

      <nav className="perspectives" aria-label="View">
        <button
          type="button"
          aria-pressed={perspective === "affiliate"}
          onClick={() => setPerspective("affiliate")}
        >
          Affiliate
        </button>
        <button
          type="button"
          aria-pressed={perspective === "compliance"}
          onClick={() => setPerspective("compliance")}
        >
          Compliance marketing team
        </button>
      </nav>

      {perspective === "compliance" ? (
        <ComplianceView
          history={history}
          reviewId={reviewId}
          onSelect={setReviewId}
          onApprove={approve}
        />
      ) : (
      <>
      <div className="workspace">
        <aside className="sidebar">
          <p className="section-label">Standard</p>
          <div className="choices">
            <button
              type="button"
              className={`choice${view.kind === "artifact" && view.id === standard.id ? " selected" : ""}`}
              onClick={() => openArtifact(standard.id)}
            >
              <span className="name">{standard.title}</span>
              <span className="meta">{standard.channel}</span>
            </button>
          </div>

          <form
            className="filing"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <p className="section-label">Submit</p>
            <div
              className={`drop-box${dropOver ? " over" : ""}${staged ? " filled" : ""}`}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "copy";
                setDropOver(true);
              }}
              onDragLeave={(event) => {
                if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
                setDropOver(false);
              }}
              onDrop={onDrop}
            >
              {staged ? (
                <div className="staged">
                  <button type="button" className="staged-open" onClick={() => openArtifact(staged.id)}>
                    <span className="name">{staged.title}</span>
                    <span className="meta">{staged.channel}</span>
                  </button>
                  <button
                    type="button"
                    className="staged-clear"
                    aria-label={`Remove ${staged.title}`}
                    onClick={() => setStagedId(null)}
                  >
                    ×
                  </button>
                </div>
              ) : (
                <p className="drop-hint">
                  {pending ? `Comparing ${pending.title}…` : "Drag a document here from the bar below"}
                </p>
              )}
            </div>

            <div className="fields">
              <label className="field">
                Location
                <select value={location} onChange={(event) => setLocation(event.target.value as Location)}>
                  {LOCATIONS.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                Delivery date
                <input
                  type="date"
                  value={deliveryDate}
                  onChange={(event) => setDeliveryDate(event.target.value)}
                  required
                />
              </label>
              <label className="field">
                Domain
                <select value={domain} onChange={(event) => setDomain(event.target.value as DomainType)}>
                  {DOMAINS.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              </label>
            </div>

            <button
              type="submit"
              className="primary flow-submit"
              disabled={!staged || !deliveryDate || pending !== null}
            >
              {pending ? "Comparing…" : "Submit"}
            </button>
            {compareError ? <p className="filed-note fail">{compareError}</p> : null}
          </form>

          <section className="history">
            <p className="section-label">Previous submissions</p>
            {history.length === 0 && !pending ? (
              <p className="hint">Nothing submitted yet.</p>
            ) : (
              <div className="choices">
                {pending ? (
                  <div className="choice pending">
                    <span className="name">{pending.title}</span>
                    <span className="meta">Comparing…</span>
                  </div>
                ) : null}
                {history.map((entry) => {
                  const phrase = statusPhrase(entry);
                  const selected = view.kind === "submission" && view.id === entry.id;
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      className={`choice${selected ? " selected" : ""}`}
                      onClick={() => setView({ kind: "submission", id: entry.id })}
                    >
                      <span className="name">{artifactById(entry.artifactId).title}</span>
                      <span className={`meta ${phrase.tone}`}>
                        {phrase.title} · {entry.location} · {timeFormatter.format(entry.submittedAt)}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        </aside>

        <main className="reader">
          <p className="pane-title reader-title">{submission ? "Corrections" : "View content"}</p>
          <article className="sheet">
            <p className="kicker">{shown.kind === "reference" ? "Standard" : shown.channel}</p>
            <h1>{shown.title}</h1>
            {shown.kind === "reference" ? (
              <p className="lede">Campaigns are checked against this document.</p>
            ) : !submission && !comparing ? (
              <p className="lede">
                {stagedId === shown.id
                  ? "Ready to submit. Set the context on the left and press Submit."
                  : "Drag this document into the submit box to check it against the standard."}
              </p>
            ) : null}

            {comparing ? (
              <div className="comparing">
                <strong>Comparing</strong>
                <p>The model is reading each requirement in the standard against this campaign. This takes up to a minute.</p>
              </div>
            ) : null}

            {submission ? (
              <StatusBanner submission={submission} onOpenStandard={() => openArtifact(standard.id)} />
            ) : null}

            <p className="section-label doc-label">Document</p>
            <HighlightedText text={shown.body} ranges={highlights} variant={shown.kind} />

            {submission && submission.findings.length > 0 ? (
              <Findings findings={submission.findings} />
            ) : null}
          </article>
        </main>
      </div>

      <div className="dock">
        <p className="dock-label">Documents</p>
        {campaigns.map((artifact) => {
          const isOpen = view.kind === "artifact" && view.id === artifact.id;
          return (
            <button
              key={artifact.id}
              type="button"
              draggable
              className={`dock-item${isOpen ? " selected" : ""}${stagedId === artifact.id ? " staged" : ""}`}
              onDragStart={(event) => {
                event.dataTransfer.setData("text/plain", artifact.id);
                event.dataTransfer.effectAllowed = "copy";
              }}
              onClick={() => openArtifact(artifact.id)}
            >
              <span className="name">{artifact.title}</span>
              <span className="meta">
                {stagedId === artifact.id ? "In the submit box" : artifact.channel}
              </span>
            </button>
          );
        })}
        <button type="button" className="dock-add" aria-label="Upload document">
          +
        </button>
      </div>
      </>
      )}
    </div>
  );
}

function ComplianceView({
  history,
  reviewId,
  onSelect,
  onApprove,
}: {
  history: Submission[];
  reviewId: string | null;
  onSelect: (id: string) => void;
  onApprove: (id: string) => void;
}) {
  const queue = history.filter((entry) => entry.findings.length === 0);
  const waiting = queue.filter((entry) => !entry.approvedAt);
  const approved = queue.filter((entry) => entry.approvedAt);
  const current = queue.find((entry) => entry.id === reviewId) ?? waiting[0] ?? approved[0] ?? null;
  const artifact = current ? artifactById(current.artifactId) : null;

  function group(label: string, entries: Submission[], empty: string) {
    return (
      <section className="queue-group">
        <p className="section-label">{label}</p>
        {entries.length === 0 ? (
          <p className="hint">{empty}</p>
        ) : (
          <div className="choices">
            {entries.map((entry) => {
              const phrase = statusPhrase(entry);
              return (
                <button
                  key={entry.id}
                  type="button"
                  className={`choice${current?.id === entry.id ? " selected" : ""}`}
                  onClick={() => onSelect(entry.id)}
                >
                  <span className="name">{artifactById(entry.artifactId).title}</span>
                  <span className={`meta ${phrase.tone}`}>
                    {phrase.title} · {entry.location} · {timeFormatter.format(entry.submittedAt)}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>
    );
  }

  return (
    <div className="workspace compliance">
      <aside className="sidebar">
        {group("Completed", waiting, "Nothing is waiting. Affiliate submissions that pass every requirement land here.")}
        {group("Approved", approved, "Nothing approved yet.")}
      </aside>

      <main className="reader">
        <p className="pane-title reader-title">Review</p>
        <article className="sheet">
          {current && artifact ? (
            <>
              <p className="kicker">{artifact.channel}</p>
              <h1>{artifact.title}</h1>
              <div className={`banner ${statusPhrase(current).tone}`}>
                <div>
                  <strong>{statusPhrase(current).title}</strong>
                  <p>{current.note}</p>
                  <p className="context-readout">
                    {current.location} · {formatDate(current.deliveryDate)} · {current.domain}
                  </p>
                </div>
                {current.approvedAt ? (
                  <p className="approved-note">
                    Approved at {timeFormatter.format(current.approvedAt)}
                  </p>
                ) : (
                  <button type="button" className="primary" onClick={() => onApprove(current.id)}>
                    Approve
                  </button>
                )}
              </div>
              <p className="section-label doc-label">Document</p>
              <HighlightedText text={artifact.body} ranges={[]} variant={artifact.kind} />
            </>
          ) : (
            <>
              <h1>Nothing to review</h1>
              <p className="lede">
                When an affiliate submission passes every requirement it shows up as Completed. Approve
                it here to move it to Approved.
              </p>
            </>
          )}
        </article>
      </main>
    </div>
  );
}

function StatusBanner({
  submission,
  onOpenStandard,
}: {
  submission: Submission;
  onOpenStandard: () => void;
}) {
  const phrase = statusPhrase(submission);
  return (
    <div className={`banner ${phrase.tone}`}>
      <div>
        <strong>{phrase.title}</strong>
        <p>{submission.note}</p>
        <p className="context-readout">
          {submission.location} · {formatDate(submission.deliveryDate)} · {submission.domain}
        </p>
      </div>
      <button type="button" className="secondary" onClick={onOpenStandard}>
        View standard
      </button>
    </div>
  );
}

function Findings({ findings }: { findings: Finding[] }) {
  return (
    <>
      <p className="section-label doc-label">Findings</p>
      {findings.map((finding) => (
        <section key={finding.ruleId} className="finding">
          <p className="rule">{finding.ruleId}</p>
          <h2>{finding.label}</h2>
          <p className="pair-label">How it was read</p>
          <p className="explanation">{finding.explanation}</p>
          {finding.highlights.length > 0 ? (
            <>
              <p className="pair-label">In the campaign</p>
              <p className="quotes">
                {finding.highlights.map((hit) => (
                  <span key={`${hit.start}-${hit.quote}`}>{hit.quote}</span>
                ))}
              </p>
            </>
          ) : null}
          {finding.detail ? (
            <>
              <p className="pair-label">In the standard</p>
              <p className="detail">{finding.detail}</p>
            </>
          ) : null}
        </section>
      ))}
    </>
  );
}
