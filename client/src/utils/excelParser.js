import * as XLSX from 'xlsx';

export function parseExcelFile(fileBuffer, filename) {
    const isCsv = filename.toLowerCase().endsWith('.csv');
    
    // Read the workbook
    const wb = XLSX.read(fileBuffer, { type: 'buffer' });
    const wsname = wb.SheetNames[0];
    const ws = wb.Sheets[wsname];
    
    // Convert to JSON
    const data = XLSX.utils.sheet_to_json(ws);
    
    const parsedQuestions = [];
    const errors = [];
    let validCount = 0;

    if (data.length === 0) {
        return { parsedQuestions: [], errors: ['No questions found in the file or empty file.'], validCount: 0 };
    }

    // Check headers on first row if we want to be strict, but sheet_to_json maps them automatically.
    // We check if required headers exist by looking at the parsed object keys of at least one valid row.
    const hasHeaders = data.some(row => row.question || row.option_a || row.correct_option);
    if (!hasHeaders) {
        return { parsedQuestions: [], errors: ['Missing required headers (question, option_a, option_b, option_c, option_d, correct_option).'], validCount: 0 };
    }

    data.forEach((row, idx) => {
        const rowNum = idx + 2; 
        
        if (row.question && row.question.toString().startsWith('Example:')) return; 

        const qText = row.question ? row.question.toString().trim() : '';
        const oa = row.option_a ? row.option_a.toString().trim() : '';
        const ob = row.option_b ? row.option_b.toString().trim() : '';
        const oc = row.option_c ? row.option_c.toString().trim() : '';
        const od = row.option_d ? row.option_d.toString().trim() : '';
        const correctRaw = row.correct_option ? row.correct_option.toString().trim().toUpperCase() : '';
        const diffRaw = row.difficulty ? row.difficulty.toString().trim().toLowerCase() : 'medium';
        const topic = row.topic ? row.topic.toString().trim() : 'General';
        const timeLimitRaw = parseInt(row.time_limit, 10);
        const timeLimit = isNaN(timeLimitRaw) || timeLimitRaw < 5 ? 20 : timeLimitRaw;
        const explanation = row.explanation ? row.explanation.toString().trim() : '';

        if (!qText && !oa && !ob && !oc && !od) return; // skip empty rows

        let rowValid = true;
        if (!qText) { errors.push(`Row ${rowNum}: Question text is required`); rowValid = false; }
        if (!oa || !ob || !oc || !od) { errors.push(`Row ${rowNum}: All 4 options (A, B, C, D) are required`); rowValid = false; }
        
        let correctIndex = 0;
        if (['A', 'B', 'C', 'D'].includes(correctRaw)) {
            correctIndex = ['A', 'B', 'C', 'D'].indexOf(correctRaw);
        } else {
            errors.push(`Row ${rowNum}: correct_option must be A, B, C, or D`);
            rowValid = false;
        }

        if (!['easy', 'medium', 'hard'].includes(diffRaw)) {
            errors.push(`Row ${rowNum}: difficulty must be easy, medium, or hard`);
            rowValid = false;
        }

        const options = [oa, ob, oc, od];
        const uniqueOptions = new Set(options.map(o => o.toLowerCase()));
        if (options.some(o => o) && uniqueOptions.size !== 4) {
             errors.push(`Row ${rowNum}: Options must be unique`);
             rowValid = false;
        }

        // Check for duplicate questions within the uploaded file
        if (parsedQuestions.find(q => q.text.toLowerCase() === qText.toLowerCase())) {
            errors.push(`Row ${rowNum}: Duplicate question detected within file`);
            rowValid = false;
        }
        
        if (rowValid) {
            validCount++;
            parsedQuestions.push({
                text: qText,
                options: options,
                correctOptionIndex: correctIndex,
                difficulty: diffRaw,
                topic: topic,
                timeLimit: timeLimit,
                explanation: explanation
            });
        }
    });
    
    if (parsedQuestions.length === 0 && errors.length === 0) {
        errors.push('No valid questions found in the file.');
    }
    
    return { parsedQuestions, errors, validCount };
}
