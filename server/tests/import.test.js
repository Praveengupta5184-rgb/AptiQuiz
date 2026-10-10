import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import * as XLSX from 'xlsx';
import { parseExcelFile } from '../../client/src/utils/excelParser.js';
import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD || 'password',
    host: process.env.PG_HOST || 'localhost',
    port: process.env.PG_PORT || 5432,
    database: process.env.PG_DATABASE || 'aptiquiz',
});

const API_URL = 'http://localhost:3005/api';

describe('Excel/CSV Import Parsing', () => {
    function createExcelBuffer(data) {
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Questions');
        return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    }
    function createCsvBuffer(data) {
        const ws = XLSX.utils.json_to_sheet(data);
        return Buffer.from(XLSX.utils.sheet_to_csv(ws), 'utf-8');
    }

    it('1. Valid Excel import', () => {
        const data = [{
            question: 'What is 2+2?', option_a: '3', option_b: '4', option_c: '5', option_d: '6',
            correct_option: 'B', difficulty: 'easy', topic: 'Math'
        }];
        const buf = createExcelBuffer(data);
        const result = parseExcelFile(buf, 'test.xlsx');
        expect(result.errors).toHaveLength(0);
        expect(result.parsedQuestions).toHaveLength(1);
    });

    it('2. Valid CSV import', () => {
        const data = [{
            question: 'Capital of France?', option_a: 'Paris', option_b: 'London', option_c: 'Berlin', option_d: 'Rome',
            correct_option: 'A', difficulty: 'medium'
        }];
        const buf = createCsvBuffer(data);
        const result = parseExcelFile(buf, 'test.csv');
        expect(result.errors).toHaveLength(0);
        expect(result.parsedQuestions[0].text).toBe('Capital of France?');
    });

    it('3. Missing required headers', () => {
        const data = [{ invalidHeader: 'foo' }];
        const buf = createExcelBuffer(data);
        const result = parseExcelFile(buf, 'test.xlsx');
        expect(result.errors[0]).toMatch(/Missing required headers/);
    });

    it('4. Empty file', () => {
        const buf = createExcelBuffer([]);
        const result = parseExcelFile(buf, 'test.xlsx');
        expect(result.errors[0]).toMatch(/No questions found/);
    });

    it('5. Invalid correct answer', () => {
        const data = [{
            question: 'Q1', option_a: '1', option_b: '2', option_c: '3', option_d: '4',
            correct_option: 'E' // Invalid
        }];
        const buf = createExcelBuffer(data);
        const result = parseExcelFile(buf, 'test.xlsx');
        expect(result.errors[0]).toMatch(/Row 2: correct_option must be A, B, C, or D/);
    });

    it('6. Missing required option', () => {
        const data = [{
            question: 'Q1', option_a: '1', option_b: '2', option_c: '3', // missing D
            correct_option: 'A'
        }];
        const buf = createExcelBuffer(data);
        const result = parseExcelFile(buf, 'test.xlsx');
        expect(result.errors[0]).toMatch(/Row 2: All 4 options/);
    });

    it('7. Invalid difficulty or time limit', () => {
        const data = [{
            question: 'Q1', option_a: '1', option_b: '2', option_c: '3', option_d: '4',
            correct_option: 'A', difficulty: 'impossible', time_limit: -10
        }];
        const buf = createExcelBuffer(data);
        const result = parseExcelFile(buf, 'test.xlsx');
        expect(result.errors[0]).toMatch(/Row 2: difficulty must be easy, medium, or hard/);
    });

    it('8. Empty rows', () => {
        const data = [{
            question: 'Q1', option_a: '1', option_b: '2', option_c: '3', option_d: '4', correct_option: 'A'
        }, {}, {
            question: 'Q2', option_a: '1', option_b: '2', option_c: '3', option_d: '4', correct_option: 'A'
        }];
        const buf = createExcelBuffer(data);
        const result = parseExcelFile(buf, 'test.xlsx');
        expect(result.parsedQuestions).toHaveLength(2); // Skipped the empty row
    });

    it('9. Duplicate question warning', () => {
        const data = [{
            question: 'Q1', option_a: '1', option_b: '2', option_c: '3', option_d: '4', correct_option: 'A'
        }, {
            question: 'Q1', option_a: '1', option_b: '2', option_c: '3', option_d: '4', correct_option: 'A'
        }];
        const buf = createExcelBuffer(data);
        const result = parseExcelFile(buf, 'test.xlsx');
        expect(result.errors[0]).toMatch(/Duplicate question/);
    });
});

describe('Backend API POST /api/tests Integration', () => {
    let teacherToken;

    beforeAll(async () => {
        // Register a test teacher via the live API
        const email = 'importtest' + Date.now() + '@example.com';
        const regRes = await fetch(`${API_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ displayName: 'Import Tester', email, password: 'password' })
        });
        if (!regRes.ok) console.error('Register failed:', await regRes.text());

        const res = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password: 'password' })
        });
        const text = await res.text();
        try {
            teacherToken = JSON.parse(text).token;
        } catch(e) {
            console.error('Login failed HTML:', text);
        }
    });

    afterAll(async () => {
        await pool.end();
    });

    it('10. Unauthenticated import attempt', async () => {
        const res = await fetch(`${API_URL}/tests`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: 'T', questions: [] })
        });
        expect(res.status).toBe(401);
    });

    it('11. Database transaction rollback when an insert fails (invalid option size)', async () => {
        const longTopic = 'A'.repeat(300); // varchar(255) constraint violation

        const res = await fetch(`${API_URL}/tests`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${teacherToken}` },
            body: JSON.stringify({
                title: 'Transaction Test Rollback',
                questions: [{
                    text: 'Q1', options: ['1','2','3','4'], correctOptionIndex: 0, topic: longTopic
                }]
            })
        });
        
        expect(res.status).toBe(500);
        
        // Verify test was rolled back
        const qsRes = await pool.query("SELECT * FROM question_sets WHERE title = 'Transaction Test Rollback'");
        expect(qsRes.rowCount).toBe(0); // Should be rolled back
    });
});
