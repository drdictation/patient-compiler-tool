# Evaluation Framework

## Purpose

This directory contains the evaluation infrastructure for measuring clinical letter quality before and after prompt changes. It ensures that "demonstrably improves" means something: **identical inputs, clinician-reviewed expected facts, and a recorded baseline**.

## Rules

1. **Never commit real patient data.** All fixtures must use synthetic, de-identified transcripts. De-identification must be manual and verified.
2. **Evaluation is manually invoked only.** The `eval:baseline` script costs API tokens and must never run in CI.
3. **Clinician review gates prompt changes.** A fixture must have `clinicianReviewed: true` before it can be used to accept or reject a prompt change in Boundary 8.
4. **Baselines are gitignored.** `evaluation/baselines/` holds generated LLM output and must not be committed.

---

## Directory Structure

```
evaluation/
  schema.ts              — TypeScript type for EvaluationFixture (source of truth)
  validate-fixtures.ts   — Fixture validator script (no API cost)
  README.md              — This file
  fixtures/              — Committed synthetic fixtures
    fixture-01-general-new.json
    fixture-02-ibd-review.json
    fixture-03-functional-new.json
    fixture-04-oesophageal-new.json
    fixture-05-eoe-review.json
  baselines/             — Gitignored, holds generated baseline outputs
    .gitkeep
```

---

## Fixture Schema

Each fixture (see [`schema.ts`](./schema.ts)) must contain:

| Field | Required | Description |
|-------|----------|-------------|
| `id` | ✅ | Unique identifier |
| `description` | ✅ | What this fixture tests |
| `patientName` | ✅ | Synthetic name only |
| `patientId` | ✅ | Synthetic ID (e.g. SYNTH-001) |
| `consultOptions` | ✅ | `noteType`, `letterType`, `templateType`, `detailLevel`, `pronouns` |
| `transcript` | ✅ | Synthetic de-identified transcript |
| `requiredFacts` | ✅ | Medications, diagnoses, investigations, followUp, gpActions |
| `forbiddenFacts` | ✅ | Facts that must NOT appear |
| `allowedPhrasings` | ✅ | Alternative acceptable wordings |
| `requiredSections` | ✅ | Letter sections that must be present |
| `gpActionExpected` | ✅ | `'action' \| 'no_action' \| 'unclear'` |
| `clinicianReviewed` | ✅ | Must be `true` before use in evaluation gates |
| `promptVersion` | ✅ | Prompt version at fixture creation |
| `createdAt` | ✅ | ISO 8601 creation timestamp |

---

## Commands

### Validate fixtures (no API cost)
```bash
npm run eval:validate
```
Checks all fixtures structurally against the schema, asserts required/forbidden facts exist, scans for prohibited identifier patterns, and reports `clinicianReviewed` status.

### Run baseline generation (costs API tokens — manual only)
```bash
npm run eval:baseline
```
Runs generation against all fixtures with `clinicianReviewed: true` and records outputs to `evaluation/baselines/`. Records model, prompt version, latency, input tokens, output tokens, and timestamp for each run.

---

## Adding a New Fixture

1. Create `evaluation/fixtures/fixture-XX-<template>-<type>.json` following the schema.
2. Set `clinicianReviewed: false` initially.
3. Run `npm run eval:validate` — it must pass with no errors.
4. Review the `requiredFacts`, `forbiddenFacts`, and `gpActionExpected` annotations against the transcript.
5. Correct any errors in the annotations.
6. Set `clinicianReviewed: true` once you're confident the expected facts are accurate.

---

## Clinician Review Checklist

For each fixture, confirm:

- [ ] Transcript is entirely synthetic — no real patient details
- [ ] `requiredFacts.medications` — correct drug names AND doses
- [ ] `requiredFacts.diagnoses` — only diagnoses explicitly supported by transcript
- [ ] `requiredFacts.investigations` — correctly labelled completed vs planned
- [ ] `requiredFacts.gpActions` — only actions the GP should take (not clinic-internal actions)
- [ ] `forbiddenFacts` — facts not mentioned and should not be hallucinated
- [ ] `gpActionExpected` — correctly reflects transcript intent
- [ ] `allowedPhrasings` — reasonable alternative wordings accepted
- [ ] Set `clinicianReviewed: true` when satisfied

---

## Fixtures: Clinical Coverage

| Fixture | Template | Type | Key Test Scenarios |
|---------|----------|------|--------------------|
| fixture-01 | general | new | Explicit GP action, clear medication dose, completed investigation |
| fixture-02 | ibd | review | Negation, planned investigation, no GP action |
| fixture-03 | functional | new | Ambiguous medication dose, family names, unclear GP action |
| fixture-04 | oesophageal | new | Short/noisy transcript, explicit pronoun, oesophageal routing |
| fixture-05 | eoe | review | Complex multi-problem, detailed mode, EoE routing |
