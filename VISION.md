# Patient Compiler — Vision Statement

A **gastroenterology-focused AI-EMR** that structures, tracks, and summarises clinical information across encounters — while preserving source text for auditability.

---

## Core Intent

- Every dictation captures **what was said**.
- This application structures **what it meant** and tracks **how it evolved**.
- It allows the clinician to:
  - See the full narrative of a patient at a glance
  - Track symptoms and interventions over time
  - Quickly prepare for follow-up visits
  - Never lose context across months or years

---

## Patient Population

This tool is designed for a **gastroenterology practice** including:

| Category | Examples |
|----------|----------|
| **Functional GI** | IBS, functional dyspepsia, complex symptom overlaps |
| **Inflammatory** | IBD (Crohn's, UC), EoE |
| **Motility** | Complex oesophageal motility disorders (achalasia, etc.) |
| **Surveillance** | Polyp surveillance, Barrett's monitoring |
| **Open Access** | Iron deficiency, FOBT-positive referrals → scope |

---

## Core Features

### 1. Symptom-Based Problem/Issue List
- **Not diagnosis-driven** — tracks symptoms and clinical issues (e.g., "chronic bloating", "iron deficiency", "oesophageal dysphagia")
- AI extracts from encounters; clinician curates
- Categories: Active / Resolved / Monitoring
- Each problem links to source encounters

### 2. Symptom Tracking Over Time
- Track key symptom domains longitudinally
- View evolution: "bloating: severe → moderate → mild"
- AI extracts mentions from dictations; clinician can adjust
- No prediction — just visibility

### 3. Intervention Timeline
- What was tried, when, with what response?
- Medications, diets, procedures
- Example: "Low FODMAP (Mar 2024) — partial response" → "Rifaximin trial (Jun 2024) — no benefit"

### 4. Investigations Dashboard
- Log of tests performed with dates
- Endoscopy, colonoscopy, breath tests, motility studies, bloods
- **Recall/follow-up tracking**: "Colonoscopy due 2027 for polyp surveillance"
- Pending vs completed

### 5. Pre-Visit Brief (AI-Generated)
- Optional, on-demand summary before seeing a patient
- Covers: key issues, recent trajectory, open questions, scheduled follow-ups
- Always labeled as AI-generated; links to source

### 6. Encounter Summarisation
- AI summarises long dictations into:
  - 1-liner (for timeline view)
  - 3-bullet (for quick review)
  - Full text (always available)
- Never replaces source; always supplementary

---

## Trust & Safety Principles

| Principle | Implementation |
|-----------|----------------|
| Source is sacred | Source text is never modified or hidden |
| AI is advisory | All AI output is labeled, reviewable, editable |
| Clinician controls curation | AI suggests; you accept/reject/edit |
| Auditability | Version history for any curated content |
| No prediction | AI summarises and tracks — does not predict or recommend |

---

## What This Is NOT

- ❌ Multi-user / collaborative
- ❌ Patient-facing
- ❌ Real-time decision support
- ❌ Guideline enforcement (no Rome IV tracker, no red flags)
- ❌ Pattern prediction / correlation finder
- ❌ Billing or admin tool

---

## Design North Star

> Before seeing a returning patient, I can open their record and within 30 seconds understand:
> - What symptoms are active
> - What has been tried (and worked/didn't work)
> - What investigations are done/pending/due
> - What my own thinking was at each step
> - When they need to come back

---

## Implementation Roadmap

### Phase 1: Foundation ✅ COMPLETE
1. ✅ **Problem/Issue List** — AI-extracted, clinician-curated symptom/issue tracking
2. ✅ **Intervention Timeline** — Log of treatments/diets/procedures with responses
3. ✅ **Investigations Dashboard** — Tests done, pending, and recall schedule

### Phase 2: Intelligence ✅ COMPLETE
4. ✅ **Smart Notes** — AI-generated notes and letters from transcripts/audio
5. ✅ **Pre-Visit Brief** — On-demand patient summary before appointments
6. ✅ **Task Extraction** — AI extracts clinical/administrative/follow-up tasks

### Phase 3: Polish 🚧 IN PROGRESS
7. ⬜ **Symptom Tracking View** — Longitudinal visual of symptom evolution
8. ⬜ **Recall/Follow-up Management** — Surface upcoming surveillance scopes, follow-up tests
9. ⬜ **Encounter Summarisation** — AI-generated summaries (1-liner, 3-bullet, full)

---

## Non-Goals & Guardrails (for AI/Agent)

### 🚫 Never
- Predict outcomes or suggest diagnoses
- Auto-generate content without user action
- Modify source text
- Implement Rome IV or other criteria-based trackers
- Add "red flag" or "alert" systems

### ✅ Always
- Label AI content distinctly
- Link to source for any extraction
- Allow rejection/editing of AI suggestions
- Preserve full version history
- Ask before implementing ambiguous features
