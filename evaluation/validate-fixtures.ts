#!/usr/bin/env tsx
/**
 * Fixture Validator
 *
 * Validates all evaluation fixtures against the EvaluationFixture schema.
 * Run with: npm run eval:validate
 *
 * Exit code 0 = all fixtures valid.
 * Exit code 1 = one or more validation failures.
 *
 * This script is safe to run without any API cost.
 */

import fs from 'fs';
import path from 'path';
import type { EvaluationFixture, RequiredFacts } from './schema';

// ── Configuration ─────────────────────────────────────────────────────────────

const FIXTURES_DIR = path.join(import.meta.dirname, 'fixtures');
const REQUIRED_SECTIONS_DEFAULT = ['Summary', 'Impression and Plan'];

/** Prohibited identifier patterns — presence triggers a warning for manual review. */
const PROHIBITED_PATTERNS: { label: string; pattern: RegExp }[] = [
    { label: 'date of birth (dd/mm/yyyy)', pattern: /\b\d{2}\/\d{2}\/\d{4}\b/ },
    { label: 'date of birth (dd-mm-yyyy)', pattern: /\b\d{2}-\d{2}-\d{4}\b/ },
    { label: 'phone number (AU format)', pattern: /\b0[2-478]\d{8}\b|\b04\d{8}\b/ },
    { label: 'MRN-like pattern', pattern: /\bMRN[:\s]?\d{4,}/i },
    { label: 'Medicare number', pattern: /\b\d{4}\s\d{5}\s\d\b/ },
    { label: 'postcode (AU)', pattern: /\b[0-9]{4}\b/ },
];

// ── Types ─────────────────────────────────────────────────────────────────────

interface ValidationResult {
    id: string;
    file: string;
    errors: string[];
    warnings: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isNonEmptyString(value: unknown, field: string): string | null {
    if (typeof value !== 'string' || value.trim().length === 0) {
        return `"${field}" must be a non-empty string`;
    }
    return null;
}

function isBoolean(value: unknown, field: string): string | null {
    if (typeof value !== 'boolean') {
        return `"${field}" must be a boolean`;
    }
    return null;
}

function isStringArray(value: unknown, field: string): string | null {
    if (!Array.isArray(value) || !value.every(v => typeof v === 'string')) {
        return `"${field}" must be an array of strings`;
    }
    return null;
}

function validateRequiredFacts(facts: unknown): string[] {
    const errors: string[] = [];
    if (!facts || typeof facts !== 'object') {
        return ['"requiredFacts" must be an object'];
    }
    const f = facts as Record<string, unknown>;
    for (const key of ['medications', 'diagnoses', 'investigations', 'followUp', 'gpActions'] as const) {
        const err = isStringArray(f[key], `requiredFacts.${key}`);
        if (err) errors.push(err);
    }
    return errors;
}

function hasAtLeastOneFactOrForbidden(fixture: EvaluationFixture): boolean {
    const rf = fixture.requiredFacts as RequiredFacts;
    const totalRequired =
        rf.medications.length +
        rf.diagnoses.length +
        rf.investigations.length +
        rf.followUp.length +
        rf.gpActions.length;
    return totalRequired > 0 || fixture.forbiddenFacts.length > 0;
}

function scanForProhibitedPatterns(text: string): string[] {
    const found: string[] = [];
    for (const { label, pattern } of PROHIBITED_PATTERNS) {
        if (pattern.test(text)) {
            found.push(label);
        }
    }
    return found;
}

// ── Core validator ────────────────────────────────────────────────────────────

function validateFixture(filePath: string): ValidationResult {
    const file = path.basename(filePath);
    const errors: string[] = [];
    const warnings: string[] = [];

    let raw: unknown;
    try {
        raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch (e: any) {
        return { id: file, file, errors: [`JSON parse error: ${e.message}`], warnings };
    }

    if (!raw || typeof raw !== 'object') {
        return { id: file, file, errors: ['Fixture must be a JSON object'], warnings };
    }

    const f = raw as Record<string, unknown>;

    // Required string fields
    for (const field of ['id', 'description', 'patientName', 'patientId', 'transcript', 'promptVersion', 'createdAt'] as const) {
        const err = isNonEmptyString(f[field], field);
        if (err) errors.push(err);
    }

    // consultOptions
    if (!f.consultOptions || typeof f.consultOptions !== 'object') {
        errors.push('"consultOptions" must be an object');
    } else {
        const opts = f.consultOptions as Record<string, unknown>;
        for (const field of ['noteType', 'letterType', 'templateType']) {
            const err = isNonEmptyString(opts[field], `consultOptions.${field}`);
            if (err) errors.push(err);
        }
        const validNoteTypes = ['new_consult', 'review_consult'];
        if (typeof opts.noteType === 'string' && !validNoteTypes.includes(opts.noteType)) {
            errors.push(`consultOptions.noteType must be one of: ${validNoteTypes.join(', ')}`);
        }
        const validLetterTypes = ['new', 'review'];
        if (typeof opts.letterType === 'string' && !validLetterTypes.includes(opts.letterType)) {
            errors.push(`consultOptions.letterType must be one of: ${validLetterTypes.join(', ')}`);
        }
        const validTemplates = ['general', 'ibd', 'functional', 'oesophageal', 'eoe'];
        if (typeof opts.templateType === 'string' && !validTemplates.includes(opts.templateType)) {
            errors.push(`consultOptions.templateType must be one of: ${validTemplates.join(', ')}`);
        }
    }

    // requiredFacts
    const rfErrors = validateRequiredFacts(f.requiredFacts);
    errors.push(...rfErrors);

    // forbiddenFacts
    const ffErr = isStringArray(f.forbiddenFacts, 'forbiddenFacts');
    if (ffErr) errors.push(ffErr);

    // requiredSections
    const rsErr = isStringArray(f.requiredSections, 'requiredSections');
    if (rsErr) {
        errors.push(rsErr);
    } else {
        const sections = f.requiredSections as string[];
        for (const s of REQUIRED_SECTIONS_DEFAULT) {
            if (!sections.includes(s)) {
                warnings.push(`requiredSections is missing "${s}" — is this intentional?`);
            }
        }
    }

    // gpActionExpected
    const validGpActions = ['action', 'no_action', 'unclear'];
    if (typeof f.gpActionExpected !== 'string' || !validGpActions.includes(f.gpActionExpected)) {
        errors.push(`"gpActionExpected" must be one of: ${validGpActions.join(', ')}`);
    }

    // allowedPhrasings
    if (f.allowedPhrasings !== undefined) {
        if (typeof f.allowedPhrasings !== 'object' || Array.isArray(f.allowedPhrasings)) {
            errors.push('"allowedPhrasings" must be a plain object (Record<string, string[]>)');
        }
    }

    // clinicianReviewed
    const crErr = isBoolean(f.clinicianReviewed, 'clinicianReviewed');
    if (crErr) errors.push(crErr);
    else if (f.clinicianReviewed === false) {
        warnings.push('clinicianReviewed=false — this fixture must be reviewed before use in evaluation gates');
    }

    // Must have at least one fact or forbidden fact
    if (errors.length === 0) {
        const fixture = f as unknown as EvaluationFixture;
        if (!hasAtLeastOneFactOrForbidden(fixture)) {
            errors.push('Fixture must have at least one requiredFact or forbiddenFact');
        }
    }

    // Scan transcript for prohibited patterns
    if (typeof f.transcript === 'string') {
        const found = scanForProhibitedPatterns(f.transcript);
        for (const label of found) {
            warnings.push(`Transcript contains a pattern matching "${label}" — manual de-identification check required`);
        }
    }

    const id = typeof f.id === 'string' ? f.id : file;
    return { id, file, errors, warnings };
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main(): void {
    if (!fs.existsSync(FIXTURES_DIR)) {
        console.error(`ERROR: Fixtures directory not found: ${FIXTURES_DIR}`);
        process.exit(1);
    }

    const files = fs.readdirSync(FIXTURES_DIR)
        .filter(f => f.endsWith('.json'))
        .map(f => path.join(FIXTURES_DIR, f))
        .sort();

    if (files.length === 0) {
        console.error('ERROR: No fixture JSON files found in evaluation/fixtures/');
        process.exit(1);
    }

    console.log(`\nEvaluation Fixture Validator`);
    console.log(`Found ${files.length} fixture(s)\n`);

    const results: ValidationResult[] = files.map(validateFixture);

    let hasErrors = false;
    let unreviewed = 0;

    for (const result of results) {
        const status = result.errors.length > 0 ? '✗ FAIL' : '✓ OK  ';
        console.log(`  ${status}  ${result.id}`);

        for (const err of result.errors) {
            console.log(`         ERROR: ${err}`);
        }
        for (const warn of result.warnings) {
            console.log(`         WARN:  ${warn}`);
        }

        if (result.errors.length > 0) hasErrors = true;
        // Count unreviewed only among valid fixtures
        if (result.errors.length === 0) {
            const raw = JSON.parse(fs.readFileSync(
                path.join(FIXTURES_DIR, result.file), 'utf-8'
            ));
            if (raw.clinicianReviewed === false) unreviewed++;
        }
    }

    console.log('');
    console.log(`Summary:`);
    console.log(`  Total:      ${results.length}`);
    console.log(`  Passed:     ${results.filter(r => r.errors.length === 0).length}`);
    console.log(`  Failed:     ${results.filter(r => r.errors.length > 0).length}`);
    console.log(`  Unreviewed: ${unreviewed} (clinicianReviewed=false)`);

    if (unreviewed > 0) {
        console.log(`\n  ⚠ ${unreviewed} fixture(s) need clinician review before use in evaluation gates.`);
    }

    if (hasErrors) {
        console.log(`\n  ✗ Validation failed — fix the errors above before running eval:baseline.\n`);
        process.exit(1);
    } else {
        console.log(`\n  ✓ All fixtures are structurally valid.\n`);
    }
}

main();
