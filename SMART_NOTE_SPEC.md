# Smart Note Feature — Implementation Summary

> **STATUS: ✅ IMPLEMENTED** — Smart Note generation, audio recording, transcription, and task extraction are live.

## Overview
The Smart Note flow turns a consultation transcript (pasted or recorded) into:
- A raw transcript artifact
- An internal consult note
- An optional referrer letter
- Extracted tasks

This is implemented in `src/components/smart-note-dialog.tsx` with server actions in `src/app/actions.ts`.

---

## UI & Workflow

### Input Modes
- **Paste Transcript** (default)
- **Record Audio** (MediaRecorder → Groq Whisper transcription)

### User Inputs
- Encounter date
- Note type: **New Consult** or **Review Consult**
- Outputs: **Consult Note**, **Letter**
- Letter type (if letter enabled): **New** or **Review**
- Letter template: **General**, **IBD**, **Functional**, **Oesophageal**, **EoE**
- Model: **Gemini 2.5 Flash**, **Gemini 3.0 Flash**, **Gemini 2.5 Flash‑Lite**

### Generation Flow
1. Ensure encounter exists for the selected date
2. Save raw transcript as `RAW_TRANSCRIPT`
3. Generate consult note and/or letter via Gemini
4. Save outputs as artifacts with versioning
5. Extract tasks via Groq Llama 4

**Note:** After transcription, the user still clicks **Generate** (no auto‑trigger).

---

## Data Model (As Used)
- `encounter`
  - `canonical_patient_id`
  - `encounter_date`
- `artifact`
  - `encounter_id`
  - `artifact_type` = `RAW_TRANSCRIPT | INTERNAL_NOTE | REFERRER_LETTER`
  - `current_version`
- `artifact_version`
  - `artifact_id`
  - `version_number`
  - `content`

Artifacts are versioned: subsequent generations update `artifact.current_version` and append to `artifact_version`.

---

## Prompts & Templates
Prompts live in `src/lib/prompts/` and are assembled in `src/lib/prompts.ts`:
- `new-consult-note.ts`
- `review-consult-note.ts`
- `new-letter.ts`
- `review-letter.ts`
- `ibd-new-letter.ts`
- `ibd-review-letter.ts`
- `functional-new-letter.ts`
- `functional-review-letter.ts`
- `oesophageal-new-letter.ts`
- `eoe-new-letter.ts`

Template routing rules:
- **General** → `NEW_LETTER` / `REVIEW_LETTER`
- **IBD** → `IBD_NEW_LETTER` / `IBD_REVIEW_LETTER`
- **Functional** → `FUNCTIONAL_NEW_LETTER` / `FUNCTIONAL_REVIEW_LETTER`
- **Oesophageal** → `OESOPHAGEAL_NEW_LETTER` (Review falls back to Functional Review)
- **EoE** → `EOE_NEW_LETTER` (Review falls back to Functional Review)

---

## Audio Recording & Transcription
- Uses `MediaRecorder` with Opus/webm at low bitrate to keep files small
- Enforces **25 MB** max before transcription
- Transcription is done via **Groq Whisper (whisper-large-v3)**
- Uses **Server Action** `transcribeAudioAction` (no `/api/transcribe` route)

---

## Task Extraction
- Always runs after Smart Note generation
- Uses **Groq Llama 4 Maverick**
- Saves each task to `patient_task` with `lifecycle_state = suggested`

---

## Files Involved
- `src/components/smart-note-dialog.tsx`
- `src/app/actions.ts` (createSmartNote, transcribeAudioAction)
- `src/lib/llm.ts` (generateFromPrompt, extractTasks)
- `src/lib/prompts.ts` and `src/lib/prompts/*`

---

## Known Behavior Notes
- Transcription does **not** auto‑trigger generation; user must click **Generate**.
- Review letters for Oesophageal/EoE reuse the Functional Review prompt.
