
const PDFDocument = require('pdfkit');

function createPdfBuffer(text) {
    return new Promise((resolve) => {
        const doc = new PDFDocument();
        const chunks = [];
        doc.on('data', (c) => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        if (text) {
            doc.text(text);
        }
        // If text is not provided, we just add an empty page to simulate image/scanned PDF
        doc.end();
    });
}

describe('PDF Extraction Integration', () => {
    let teacherToken;
    beforeAll(async () => {
        const email = 'pdfimport' + Date.now() + '@example.com';
        await fetch(`${API_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ displayName: 'PDF Tester', email, password: 'password' })
        });
        const res = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password: 'password' })
        });
        const text = await res.text();
        teacherToken = JSON.parse(text).token;
    });

    it('12. Valid text-based PDF import', async () => {
        const pdfText = `
            Q1. What is the capital of France?
            A) London
            B) Paris
            C) Rome
            D) Madrid
        `;
        const buffer = await createPdfBuffer(pdfText);
        
        const blob = new Blob([buffer], { type: 'application/pdf' });
        const formData = new FormData();
        formData.append('pdf', blob, 'test.pdf');
        
        const res = await fetch(`${API_URL}/tests/parse-pdf`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${teacherToken}` },
            body: formData
        });
        
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.questions.length).toBe(1);
        expect(data.questions[0].text).toContain('capital of France');
        expect(data.questions[0].options[1]).toContain('Paris');
    });

    it('13. Scanned PDF detection (rejection)', async () => {
        // Create an empty PDF (simulating scanned/image PDF with no selectable text)
        const buffer = await createPdfBuffer(''); 
        
        const blob = new Blob([buffer], { type: 'application/pdf' });
        const formData = new FormData();
        formData.append('pdf', blob, 'scanned.pdf');
        
        const res = await fetch(`${API_URL}/tests/parse-pdf`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${teacherToken}` },
            body: formData
        });
        
        expect(res.status).toBe(400);
        const data = await res.json();
        expect(data.error).toMatch(/scanned or image-based/);
    });
});
