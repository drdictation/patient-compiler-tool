# Smart Note Feature Implementation Spec

## Project Context
This is a Next.js 14+ application (App Router) for a gastroenterology patient management tool. The codebase uses:
- **Supabase** for database (PostgreSQL)
- **shadcn/ui** components
- **Sonner** for toasts
- **Gemini API** for LLM calls (see `src/lib/llm.ts`)
- **Server Actions** for mutations (see `src/app/actions.ts`)

Key existing patterns:
- Patient data is stored in `canonical_patient`, records in `source_record_cache`, and notes as `artifacts` linked to `encounters`.
- The existing `AddNoteDialog` component (at `src/components/add-note-dialog.tsx`) creates manual notes. This new feature should be a **separate** "Smart Note" button alongside it.

---

## Feature Requirements

### 1. "Smart Note" Button & Dialog
Create a new component: `src/components/smart-note-dialog.tsx`

**UI Elements:**
- **Trigger Button**: "Smart Note" (with sparkles icon), placed in the patient page header next to "Add Note".
- **Dialog Contents:**
  - **Textarea**: For pasting the raw transcript/dictation.
  - **Note Type Selector** (radio or select):
    - "New Consult" 
    - "Review Consult"
  - **Output Checkboxes** (multi-select):
    - ☑️ Generate Consult Note
    - ☑️ Generate Letter
  - **Letter Type Selector** (only shown if "Generate Letter" is checked):
    - "New Letter"
    - "Review Letter"
  - **Model Selector**: Dropdown with ONLY:
    - "Gemini 2.5 Flash"
    - "Gemini 3.0 Flash"
  - **Submit Button**: "Generate" (with loading state)

---

### 2. LLM Processing Logic
When user clicks "Generate":

1. **Save Raw Transcript**: Store the raw input text as an artifact with type `RAW_TRANSCRIPT` on the current date's encounter (create encounter if needed).

2. **Separate LLM Calls**: For each selected output, make independent API calls:
   - If "Generate Consult Note" is checked → Call LLM with the appropriate prompt (New Consult vs Review Consult).
   - If "Generate Letter" is checked → Call LLM with the appropriate prompt (New Letter vs Review Letter).

3. **Save Outputs**: Each LLM output is saved as a separate artifact:
   - Consult Note → artifact type `INTERNAL_NOTE`
   - Letter → artifact type `REFERRER_LETTER`

**Important**: The prompts for each output type will be provided separately by the user. Create placeholder constants:
```typescript
const PROMPTS = {
  NEW_CONSULT_NOTE: "{{USER_WILL_PROVIDE}}",
  REVIEW_CONSULT_NOTE: "{{USER_WILL_PROVIDE}}",
  NEW_LETTER: "{{USER_WILL_PROVIDE}}",
  REVIEW_LETTER: "{{USER_WILL_PROVIDE}}"
};
```

---

### 3. Audio Recording (Phase 2 - Prepare Scaffolding)
Add a secondary mode toggle in the dialog:
- **Mode A: Paste Transcript** (default) - textarea input
- **Mode B: Record Audio** - browser-based recording using `MediaRecorder API`

When Mode B is active:
1. Show a **Record** button (microphone icon).
2. On click, start recording from user's microphone.
3. Show recording indicator (duration, waveform if possible).
4. On **Stop**, show a "Transcribe" button.
5. On **Transcribe**:
   - Send audio to Groq Whisper API (`whisper-large-v3` model).
   - Auto-populate the transcript textarea.
   - Auto-trigger the LLM generation (no pause for review).

**Groq Whisper API Reference:**
```
POST https://api.groq.com/openai/v1/audio/transcriptions
Headers: Authorization: Bearer $GROQ_API_KEY
Body: FormData with { file: audioBlob, model: "whisper-large-v3" }
```

---

### 4. Data Model
No schema changes needed. Use existing tables:
- `timeline_encounter`: Link artifacts to a date.
- `encounter_artifact`: Store each output.
  - `artifact_type`: `RAW_TRANSCRIPT`, `INTERNAL_NOTE`, or `REFERRER_LETTER`
  - `content`: The text content.
  - Store `versions` array for edit history if applicable.

---

### 5. Global User Settings (Future Enhancement Note)
For now, prompts are hardcoded constants. In the future, add a settings page where the user can customize:
- Default prompts for each note type
- Default model selection
- Letter recipient preferences

---

## Technical Notes

- **Error Handling**: If one LLM call fails, still save the other. Show toast with partial success.
- **Token Limits**: Letter prompts may be ~8k tokens. Ensure the Gemini API call handles this.
- **Loading States**: Show progress for each output being generated (e.g., "Generating Note... ✓", "Generating Letter...").

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `src/components/smart-note-dialog.tsx` | **CREATE** - Main dialog component |
| `src/lib/prompts.ts` | **CREATE** - Placeholder prompts |
| `src/lib/llm.ts` | **MODIFY** - Add `generateFromPrompt(text, prompt, model)` helper |
| `src/app/actions.ts` | **MODIFY** - Add `createSmartNote` server action |
| `src/app/patient/[id]/page.tsx` | **MODIFY** - Add SmartNoteDialog to header |
| `src/app/api/transcribe/route.ts` | **CREATE** - Whisper transcription endpoint |

---

## Acceptance Criteria

1. ✅ "Smart Note" button visible in patient page header.
2. ✅ Can paste transcript and select Note Type + Output types.
3. ✅ Clicking "Generate" creates separate artifacts for Note and Letter (if both selected).
4. ✅ Raw transcript is also saved as a separate artifact.
5. ✅ Model selector only shows Gemini 2.5 Flash and Gemini 3.0 Flash.
6. ✅ Audio recording mode scaffolded (can be incomplete but UI exists).
7. ✅ Errors in one LLM call don't block the other.
