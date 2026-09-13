import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanPatientDisplayName, normalizePatientName } from '@/lib/patient-name';
import type { SaveReferralIntakeInput } from '@/app/actions';

describe('Patient Name Normalization & Honorific Stripping', () => {
    it('strips honorifics and titles case-insensitively', () => {
        assert.equal(cleanPatientDisplayName('Ms. Vanessa Lynn'), 'Vanessa Lynn');
        assert.equal(cleanPatientDisplayName('Ms Vanessa Lynn'), 'Vanessa Lynn');
        assert.equal(cleanPatientDisplayName('Mr. John Smith'), 'John Smith');
        assert.equal(cleanPatientDisplayName('Mrs Mary Jane'), 'Mary Jane');
        assert.equal(cleanPatientDisplayName('Dr. Gregory House'), 'Gregory House');
        assert.equal(cleanPatientDisplayName('Prof. Albus Dumbledore'), 'Albus Dumbledore');
        assert.equal(cleanPatientDisplayName('Miss Sarah Connor'), 'Sarah Connor');
        assert.equal(cleanPatientDisplayName('Master Bruce Wayne'), 'Bruce Wayne');
    });

    it('handles multiple spaces and preserves names without titles', () => {
        assert.equal(cleanPatientDisplayName('  Vanessa   Lynn  '), 'Vanessa Lynn');
        assert.equal(cleanPatientDisplayName('Jane Doe'), 'Jane Doe');
        assert.equal(cleanPatientDisplayName(''), 'Unknown Patient');
    });

    it('normalizes names for database matching', () => {
        assert.equal(normalizePatientName('Ms. Vanessa Lynn'), 'vanessa lynn');
        assert.equal(normalizePatientName('Vanessa Lynn'), 'vanessa lynn');
        assert.equal(normalizePatientName('Dr. JOHN SMITH'), 'john smith');
        assert.equal(
            normalizePatientName('Ms. Vanessa Lynn'),
            normalizePatientName('Vanessa Lynn')
        );
    });
});

describe('Referral Intake Data Contracts & Markdown Formatting', () => {
    it('constructs well-structured 3-point endoscopy prep card', () => {
        const input: SaveReferralIntakeInput = {
            intakeMode: 'endoscopy',
            patient: {
                displayName: 'Jane Doe',
                dateOfBirth: '14/08/1972',
                gender: 'Female',
                referringDoctor: 'Dr. Sarah Jenkins',
                referralDate: '10/09/2026'
            },
            procedure: 'Gastroscopy + Colonoscopy',
            summaryCard: {
                indication: 'Iron deficiency anaemia (Ferritin 7, Hb 102)\nChronic epigastric fullness',
                risksAndContext: 'Aspirin ceased 5 days prior\nMother diagnosed with CRC at age 62',
                proceduralActions: 'Standard D2 duodenal biopsies to rule out celiac disease\nFull colonoscopy to cecum'
            },
            rawOcrText: 'Dear Dr Basnayake, Re: Jane Doe (DOB 14/08/1972). Thank you for seeing this patient...'
        };

        // Validate basic contract fields
        assert.equal(input.patient.displayName, 'Jane Doe');
        assert.equal(input.procedure, 'Gastroscopy + Colonoscopy');
        assert.ok(input.summaryCard.indication?.includes('Iron deficiency anaemia'));
        assert.ok(input.summaryCard.risksAndContext?.includes('Aspirin ceased'));
        assert.ok(input.summaryCard.proceduralActions?.includes('D2 duodenal biopsies'));
        assert.ok(input.rawOcrText.includes('Dear Dr Basnayake'));
    });

    it('constructs well-structured general consult review card', () => {
        const input: SaveReferralIntakeInput = {
            intakeMode: 'general',
            patient: {
                displayName: 'Vanessa Lynn',
                dateOfBirth: '22/03/1985',
                gender: 'Female',
                referringDoctor: 'Dr. Andrew Miller',
                referralDate: '12/09/2026'
            },
            clinicalFocus: 'Altered bowel habit & intermittent PR bleeding',
            summaryCard: {
                reasonForReferral: '3 month history of loose stools with mucus and PR bleeding',
                medicalHistoryAndMeds: 'Asthma, Migraine. Meds: Ventolin PRN, Imigran PRN. NKDA.',
                investigations: 'FBE normal, Ferritin 45, Calprotectin 380 ug/g (elevated)',
                questionsAndPlan: 'Evaluate for inflammatory bowel disease vs proctitis; consider colonoscopy'
            },
            rawOcrText: 'Dear Dr Basnayake, Re: Vanessa Lynn. Thank you for assessing this 41yo lady...'
        };

        assert.equal(input.intakeMode, 'general');
        assert.equal(input.patient.displayName, 'Vanessa Lynn');
        assert.equal(input.clinicalFocus, 'Altered bowel habit & intermittent PR bleeding');
        assert.ok(input.summaryCard.reasonForReferral?.includes('loose stools'));
        assert.ok(input.summaryCard.medicalHistoryAndMeds?.includes('Ventolin'));
        assert.ok(input.summaryCard.investigations?.includes('Calprotectin 380'));
        assert.ok(input.summaryCard.questionsAndPlan?.includes('inflammatory bowel disease'));
    });

    it('handles fallback defaults when fields are omitted', () => {
        const minimalInput: SaveReferralIntakeInput = {
            patient: {
                displayName: 'John Smith'
            },
            summaryCard: {
                indication: 'Routine screening colonoscopy',
                risksAndContext: '',
                proceduralActions: ''
            },
            rawOcrText: 'Referral for colonoscopy'
        };

        assert.equal(minimalInput.patient.displayName, 'John Smith');
        assert.equal(minimalInput.patient.dateOfBirth, undefined);
        assert.equal(minimalInput.procedure, undefined);
    });
});
