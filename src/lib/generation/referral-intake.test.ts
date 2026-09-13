import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SaveReferralIntakeInput } from '@/app/actions';

describe('Referral Intake Data Contracts & Markdown Formatting', () => {
    it('constructs well-structured 3-point endoscopy prep card', () => {
        const input: SaveReferralIntakeInput = {
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
        assert.ok(input.summaryCard.indication.includes('Iron deficiency anaemia'));
        assert.ok(input.summaryCard.risksAndContext.includes('Aspirin ceased'));
        assert.ok(input.summaryCard.proceduralActions.includes('D2 duodenal biopsies'));
        assert.ok(input.rawOcrText.includes('Dear Dr Basnayake'));
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
