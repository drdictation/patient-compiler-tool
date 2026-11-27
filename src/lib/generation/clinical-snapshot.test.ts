import { test } from 'node:test';
import * as assert from 'node:assert';
import { slicePriorNotesBySubtitle, PriorNoteInput } from '../clinical-snapshot';

test('slicePriorNotesBySubtitle — slices REVIEW_CONSULT_NOTE subtitles accurately and excludes non-target sections', () => {
    const notes: PriorNoteInput[] = [
        {
            id: 'enc-2',
            encounterDate: '2026-10-15',
            label: 'Consult note',
            content: `
**Interval History**
* Improved post-induction with Infliximab.
* No flares or steroids since last review.

**Current Issues**

**Ulcerative Colitis (Pancolitis)**
* Frequency: 1-2 bowel motions per day.
* Nocturnal: Nil.

**Iron Deficiency**
* Resolved clinically.

**Investigation Results**
* Faecal Calprotectin: <10 ug/g (Remission).
* Infliximab Level: 14.

**Dietary History**
* Unrestricted diet.

**Past Medical History & Medications**
* Anxiety: Stable on Escitalopram 10mg.
* Current Meds: Infliximab 5mg/kg Q8W, Azathioprine 100mg daily.

**Social & Family History**
* Returned to full-time teaching.

**Medicolegal & Consent**
* Skin cancer risk discussed.

**Examination**
* Abdomen soft, non-tender.

**Plan**
1. Continue Infliximab 5mg/kg Q8W.
2. Repeat Calprotectin in 4 months.
            `.trim(),
        },
    ];

    const sliced = slicePriorNotesBySubtitle(notes);

    assert.strictEqual(sliced.issues.length, 1);
    assert.ok(sliced.issues[0].content.includes('**Interval History**'));
    assert.ok(sliced.issues[0].content.includes('Improved post-induction with Infliximab'));
    assert.ok(sliced.issues[0].content.includes('**Current Issues**'));
    assert.ok(sliced.issues[0].content.includes('**Ulcerative Colitis (Pancolitis)**'));
    assert.ok(sliced.issues[0].content.includes('**Iron Deficiency**'));

    assert.strictEqual(sliced.phxMeds.length, 1);
    assert.ok(sliced.phxMeds[0].content.includes('Anxiety: Stable on Escitalopram 10mg'));
    assert.ok(!sliced.phxMeds[0].content.includes('Unrestricted diet'));
    assert.ok(!sliced.phxMeds[0].content.includes('teaching'));

    assert.strictEqual(sliced.ixTrials.length, 1);
    assert.ok(sliced.ixTrials[0].content.includes('Faecal Calprotectin: <10 ug/g'));

    assert.strictEqual(sliced.plans.length, 1);
    assert.ok(sliced.plans[0].content.includes('Continue Infliximab 5mg/kg Q8W'));
    assert.ok(!sliced.plans[0].content.includes('Abdomen soft'));
});

test('slicePriorNotesBySubtitle — orders multiple consults newest-first across NEW and REVIEW formats', () => {
    const notes: PriorNoteInput[] = [
        {
            id: 'enc-old',
            encounterDate: '2025-04-01',
            label: 'Consult note',
            content: `
**Issues**
**Constipation**
* Every 7 days.

**Past Medical History & Medications**
* PCOS on Metformin XR.

**Investigations & Previous Trials**
* Prior Movicol trial with partial benefit.

**Plan**
1. Arrange gastroscopy.
            `.trim(),
        },
        {
            id: 'enc-new',
            encounterDate: '2026-08-20',
            label: 'Consult note',
            content: `
**Interval History**
* Much improved on Osmolax daily.

**Investigation Results**
* Gastroscopy normal, biopsies negative.

**Plan**
1. Continue Osmolax daily, review PRN.
            `.trim(),
        },
    ];

    const sliced = slicePriorNotesBySubtitle(notes);

    assert.strictEqual(sliced.issues.length, 2);
    assert.strictEqual(sliced.issues[0].encounterDate, '2026-08-20');
    assert.strictEqual(sliced.issues[1].encounterDate, '2025-04-01');

    assert.strictEqual(sliced.ixTrials.length, 2);
    assert.strictEqual(sliced.ixTrials[0].encounterDate, '2026-08-20');
    assert.ok(sliced.ixTrials[0].content.includes('Gastroscopy normal'));
    assert.ok(sliced.ixTrials[1].content.includes('Prior Movicol trial'));

    assert.strictEqual(sliced.plans.length, 2);
    assert.strictEqual(sliced.plans[0].encounterDate, '2026-08-20');
    assert.strictEqual(sliced.plans[1].encounterDate, '2025-04-01');

    // Old note only had PHx & Meds
    assert.strictEqual(sliced.phxMeds.length, 1);
    assert.strictEqual(sliced.phxMeds[0].encounterDate, '2025-04-01');
});

test('slicePriorNotesBySubtitle — stops Plan capture before referrer letter sign-off', () => {
    const notes: PriorNoteInput[] = [
        {
            id: 'letter-fallback',
            encounterDate: '2026-05-10',
            label: 'Referrer letter',
            content: `
## Summary
* Reflux improving on PPI.

## Impression and Plan
We will continue pantoprazole 40mg daily and review in 3 months.

No action required by you.

Kind regards,
Dr. Smith
            `.trim(),
        },
    ];

    const sliced = slicePriorNotesBySubtitle(notes);
    assert.strictEqual(sliced.issues.length, 1);
    assert.strictEqual(sliced.plans.length, 1);
    assert.ok(sliced.plans[0].content.includes('continue pantoprazole'));
    assert.ok(!sliced.plans[0].content.includes('Kind regards'));
    assert.ok(!sliced.plans[0].content.includes('No action required'));
});
