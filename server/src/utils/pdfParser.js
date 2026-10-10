const pdf = require('pdf-parse');

function parsePdfText(text) {
    // A heuristic-based parser for text extracted from PDF
    // It looks for a question number pattern (e.g. "1.", "Q1.", "1)")
    // and option patterns (e.g. "A.", "(A)", "A)")
    
    const questions = [];
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    
    let currentQuestion = null;
    
    const questionRegex = /^(?:Q?\d+[\.\)]|Question\s*\d+[\.\):])\s*(.+)/i;
    const optionRegex = /^(?:[A-D][\.\)]|\([A-D]\))\s*(.+)/i;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        const qMatch = line.match(questionRegex);
        const optMatch = line.match(optionRegex);

        if (qMatch) {
            // Push old question if exists
            if (currentQuestion) questions.push(currentQuestion);
            currentQuestion = {
                text: qMatch[1],
                options: [],
                correctOptionIndex: 0,
                difficulty: 'medium',
                topic: 'General',
                timeLimit: 20,
                explanation: ''
            };
        } else if (optMatch && currentQuestion) {
            currentQuestion.options.push(optMatch[1]);
        } else if (currentQuestion && currentQuestion.options.length === 0) {
            // Append to question text if options haven't started yet
            currentQuestion.text += ' ' + line;
        } else if (currentQuestion && currentQuestion.options.length > 0 && currentQuestion.options.length < 4) {
            // Might be a multi-line option, but for simplicity we append to the last option
            const lastIdx = currentQuestion.options.length - 1;
            currentQuestion.options[lastIdx] += ' ' + line;
        }
    }
    
    if (currentQuestion) questions.push(currentQuestion);

    // Validate and sanitize the parsed questions
    const finalQuestions = questions.map(q => {
        // If not exactly 4 options, try to split if they are on one line
        if (q.options.length === 1) {
            const splitOpts = q.options[0].split(/\s+(?:[B-D][\.\)]|\([B-D]\))\s*/);
            if (splitOpts.length === 4) {
                q.options = splitOpts.map(o => o.trim());
            }
        }
        
        let valid = true;
        let warning = null;
        
        if (q.options.length < 2) {
            valid = false;
            warning = "Missing options";
        }
        while(q.options.length < 4) {
             q.options.push(`Option ${q.options.length + 1}`);
        }
        if (q.options.length > 4) {
             q.options = q.options.slice(0, 4);
        }
        
        return { ...q, _valid: valid, _warning: warning };
    });

    return finalQuestions;
}

async function extractQuestionsFromPdf(buffer) {
    const data = await pdf(buffer);
    const text = data.text;
    const numPages = data.numpages;
    
    // Check for OCR need
    // If text is extremely short compared to pages (e.g. less than 50 chars per page on average)
    if (text.length < numPages * 50) {
        throw new Error('SCANNED_PDF');
    }
    
    const parsed = parsePdfText(text);
    return parsed;
}

module.exports = { extractQuestionsFromPdf };
