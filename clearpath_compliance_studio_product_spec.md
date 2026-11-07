# ClearPath Compliance Studio

A demo workspace for one job: check a marketing creative against a standard and see whether it passes.

Fictional company, fictional terms. Nothing here is a legal opinion. Submitting a campaign reads each requirement in the standard against that campaign, using the location, delivery date, and domain. Each miss shows the requirement, the campaign words, and how the two were compared. Refreshing the page clears submissions.

## The three artifacts

All three can be opened and read before anything is submitted.

1. **Personal Loan Advertising Standard** — the artifact other content is checked against. It states the approved amounts, APR range, fee, prohibited claims, required disclosure, the California line, and that the standard covers the personal loan domain only.
2. **Fall ClearRate** — a search ad written to pass those filters.
3. **FastCash Spring** — a landing page written to fail several of them.

## What you do

1. Click a document in the bottom bar to read it. The standard sits at the top left.
2. Drag a document from the bottom bar into the submit box. Set location, delivery date, and domain, then press Submit.
3. Submit empties the box and adds the run to Previous submissions, under the button. The right pane switches from View content to Corrections. Fall ClearRate is written to pass. FastCash Spring is written to fail. Matched phrases are marked in the creative. Each finding explains the requirement, the campaign words, and why they differ.
4. Click any previous submission to reopen its corrections. The plus on the bottom bar does not upload anything.
5. A submission that meets every requirement is marked Completed, not Approved. Switch to the Compliance marketing team view to approve it.

## Views

A bar under the header switches between two views. Both views share the same submissions.

- **Affiliate** — the submit flow above.
- **Compliance marketing team** — the left pane lists Completed submissions, then Approved ones. The right pane shows the selected document with its filing context and an Approve button. Approve moves the item from Completed to Approved, and the affiliate's Previous submissions list shows Approved too. Submissions with Changes required go back to the affiliate and do not appear here.

Location, delivery date, and domain are saved on the submission at the moment you send it. Later edits apply to the next submission only. Delivery date is context. It is not a filter.

## Marketing

Entry fields:

- **Location** — California, New York, Texas, or National. California also requires the state licensing sentence.
- **Delivery date** — when the creative is meant to run.
- **Domain** — Personal loan, Credit card, or Mortgage prequalification. Both sample campaigns are personal-loan creative, so the pass depends on filing them as Personal loan.

The left pane, top to bottom: Standard (the one reference document), Submit (the drop box, the context fields, and the Submit button), and Previous submissions. The bottom bar holds the documents you can submit, one tile per document title, plus an upload button that does nothing.

## Comparison

Submit sends the standard, split into numbered requirements, plus the campaign and the filing context to an LLM through OpenRouter (`demo/server/compare.mjs`). The model returns one result per requirement: met or not, the exact campaign quotes, an explanation, and a suggested change. The server keeps only the quotes it can find in the campaign, and it writes the status itself: Changes required if any requirement is not met, Completed otherwise. There is no numeric score.

The key lives in `demo/.env.local`, which git ignores, and only the dev server reads it. The browser never sees it. Copy `demo/.env.example` to `demo/.env.local` and set `OPENROUTER_API_KEY`. `OPENROUTER_MODEL` defaults to `nvidia/nemotron-3.5-super-vl:free`. Free models fall back to the Gemma 4 free models when rate-limited.

## Not in this demo

Reviewer assignment, version diffs, a content library beyond the one standard, and accounts.

## Run

```bash
cd demo
npm install
npm run dev
```
