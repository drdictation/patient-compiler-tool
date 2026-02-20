#!/usr/bin/env python3
"""
Interactive prompt tuning tool for letter generation.

Usage examples:
  python scripts/prompt_tuner.py --prompt new-letter
  python scripts/prompt_tuner.py --prompt review-letter --model gpt-4.1 --editor-model gpt-4.1
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Dict, Optional

import requests

PROMPT_FILES: Dict[str, str] = {
    "new-consult-note": "src/lib/prompts/new-consult-note.ts",
    "review-consult-note": "src/lib/prompts/review-consult-note.ts",
    "new-letter": "src/lib/prompts/new-letter.ts",
    "review-letter": "src/lib/prompts/review-letter.ts",
    "ibd-new-letter": "src/lib/prompts/ibd-new-letter.ts",
    "ibd-review-letter": "src/lib/prompts/ibd-review-letter.ts",
    "functional-new-letter": "src/lib/prompts/functional-new-letter.ts",
    "functional-review-letter": "src/lib/prompts/functional-review-letter.ts",
    "oesophageal-new-letter": "src/lib/prompts/oesophageal-new-letter.ts",
    "eoe-new-letter": "src/lib/prompts/eoe-new-letter.ts",
}

API_URL = "https://api.openai.com/v1/responses"


def _read_multiline(prompt: str, sentinel: str = "<<<END>>>") -> str:
    print(prompt)
    print(f"End input with a line containing {sentinel}")
    lines = []
    while True:
        try:
            line = input()
        except EOFError:
            break
        if line.strip() == sentinel:
            break
        lines.append(line)
    return "\n".join(lines).strip()


def _load_prompt_from_ts(path: str) -> str:
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()
    start = content.find("`")
    end = content.rfind("`")
    if start == -1 or end == -1 or end <= start:
        raise ValueError(f"Could not find backtick-delimited prompt in {path}")
    return content[start + 1 : end]


def _write_prompt_to_ts(path: str, new_prompt: str) -> None:
    if "`" in new_prompt:
        raise ValueError("Updated prompt contains backticks, which would break the TS template string.")
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()
    start = content.find("`")
    end = content.rfind("`")
    if start == -1 or end == -1 or end <= start:
        raise ValueError(f"Could not find backtick-delimited prompt in {path}")
    updated = content[: start + 1] + new_prompt + content[end:]
    with open(path, "w", encoding="utf-8") as f:
        f.write(updated)


def _extract_output_text(resp_json: dict) -> str:
    chunks = []
    for item in resp_json.get("output", []):
        if item.get("type") != "message":
            continue
        for part in item.get("content", []):
            if part.get("type") == "output_text":
                chunks.append(part.get("text", ""))
    return "\n".join(chunks).strip()


def _post_openai(payload: dict, api_key: str) -> dict:
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    resp = requests.post(API_URL, headers=headers, data=json.dumps(payload), timeout=120)
    if resp.status_code >= 400:
        raise RuntimeError(f"OpenAI API error {resp.status_code}: {resp.text}")
    return resp.json()


def _generate_letter(prompt_text: str, model: str, api_key: str) -> str:
    payload = {
        "model": model,
        "input": prompt_text,
        "temperature": 0.2,
    }
    data = _post_openai(payload, api_key)
    output_text = _extract_output_text(data)
    if not output_text:
        raise RuntimeError("No output_text found in OpenAI response.")
    return output_text


def _update_prompt_with_feedback(current_prompt: str, feedback: str, model: str, api_key: str) -> str:
    instructions = (
        "You are a prompt engineer. Update the prompt to address the feedback. "
        "Keep the same overall intent, structure, and placeholders ({{PATIENT_NAME}}, {{TRANSCRIPT}}). "
        "Return only the updated prompt text, no code fences or commentary."
    )
    input_text = (
        "Current prompt:\n"
        f"{current_prompt}\n\n"
        "Feedback from clinician:\n"
        f"{feedback}\n\n"
        "Return only the updated prompt text."
    )
    payload = {
        "model": model,
        "instructions": instructions,
        "input": input_text,
        "temperature": 0.2,
    }
    data = _post_openai(payload, api_key)
    updated = _extract_output_text(data)
    if not updated:
        raise RuntimeError("No updated prompt text found in OpenAI response.")
    return updated


def main() -> int:
    parser = argparse.ArgumentParser(description="Interactive prompt tuning tool.")
    parser.add_argument("--prompt", choices=sorted(PROMPT_FILES.keys()), help="Prompt key to tune")
    parser.add_argument("--prompt-file", help="Path to a prompt TS file (overrides --prompt)")
    parser.add_argument("--model", default="gpt-4.1", help="Model for generation")
    parser.add_argument("--editor-model", default=None, help="Model for prompt updates")
    parser.add_argument("--dry-run", action="store_true", help="Do not write prompt updates to disk")
    args = parser.parse_args()

    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        print("OPENAI_API_KEY is not set.", file=sys.stderr)
        return 1

    if args.prompt_file:
        prompt_path = args.prompt_file
    elif args.prompt:
        prompt_path = PROMPT_FILES[args.prompt]
    else:
        print("Specify --prompt or --prompt-file.", file=sys.stderr)
        return 1

    if args.editor_model is None:
        args.editor_model = args.model

    current_prompt = _load_prompt_from_ts(prompt_path)

    patient_name = input("Patient name (or leave blank): ").strip()
    transcript = _read_multiline("Paste transcript:")
    if not transcript:
        print("No transcript provided.", file=sys.stderr)
        return 1

    while True:
        filled_prompt = current_prompt
        if patient_name:
            filled_prompt = filled_prompt.replace("{{PATIENT_NAME}}", patient_name)
        filled_prompt = filled_prompt.replace("{{TRANSCRIPT}}", transcript)

        print("\n=== MODEL OUTPUT ===\n")
        try:
            output = _generate_letter(filled_prompt, args.model, api_key)
        except Exception as exc:
            print(f"Generation failed: {exc}", file=sys.stderr)
            return 1
        print(output)
        print("\n=== END OUTPUT ===\n")

        feedback = input(
            "Describe changes to make (or type 'accept' to finish, 'new' for new transcript, 'exit' to quit): "
        ).strip()
        if feedback.lower() in {"accept", "done", "finish"}:
            print("Accepted. Exiting.")
            return 0
        if feedback.lower() in {"exit", "quit"}:
            print("Exiting without further changes.")
            return 0
        if feedback.lower() in {"new", "new transcript"}:
            transcript = _read_multiline("Paste new transcript:")
            if not transcript:
                print("No transcript provided.", file=sys.stderr)
                return 1
            continue

        try:
            updated_prompt = _update_prompt_with_feedback(current_prompt, feedback, args.editor_model, api_key)
        except Exception as exc:
            print(f"Prompt update failed: {exc}", file=sys.stderr)
            return 1

        if not args.dry_run:
            try:
                _write_prompt_to_ts(prompt_path, updated_prompt)
            except Exception as exc:
                print(f"Failed to write prompt update: {exc}", file=sys.stderr)
                return 1

        current_prompt = updated_prompt
        print("Prompt updated. Running again with the same transcript.\n")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
