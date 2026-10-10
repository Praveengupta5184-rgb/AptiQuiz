import re

with open('client/src/pages/TeacherDashboard.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

# We need to add 'pdf' to the creationMode state choices, and add logic for PDF uploading.
# I'll just write a whole new CreateTest component and replace the old one.

# Let's extract the CreateTest code block
# Find where it starts
start_idx = content.find('function CreateTest() {')
if start_idx == -1:
    print("Could not find CreateTest")
    exit(1)

# Find where it ends (the next component is TestAnalytics or export default)
end_idx = content.find('function TestAnalytics() {')
if end_idx == -1:
    print("Could not find TestAnalytics")
    exit(1)

new_create_test = """function CreateTest() {
    const navigate = useNavigate();
    useTeacherAuth();

    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [creationMode, setCreationMode] = useState('choose'); // 'choose', 'manual', 'import', 'pdf'
    
    // Manual mode state
    const [questions, setQuestions] = useState([
        { text: '', options: ['', '', '', ''], correctOptionIndex: 0, difficulty: 'medium', topic: 'General', timeLimit: 20, explanation: '' }
    ]);

    // Import/PDF mode state
    const [importedQuestions, setImportedQuestions] = useState([]);
    const [importErrors, setImportErrors] = useState([]);
    const [fileName, setFileName] = useState('');
    const [pdfProcessing, setPdfProcessing] = useState(false);
    const [pdfError, setPdfError] = useState(null);

    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    // --- MANUAL ENTRY LOGIC ---
    const addQuestion = () => setQuestions([...questions, { text: '', options: ['', '', '', ''], correctOptionIndex: 0, difficulty: 'medium', topic: 'General', timeLimit: 20, explanation: '' }]);
    const removeQuestion = (idx) => setQuestions(questions.filter((_, i) => i !== idx));

    const updateQuestion = (idx, field, value) => {
        const newQ = [...questions];
        newQ[idx][field] = value;
        setQuestions(newQ);
    };

    const updateOption = (qIdx, optIdx, value) => {
        const newQ = [...questions];
        newQ[qIdx].options[optIdx] = value;
        setQuestions(newQ);
    };

    // --- EXCEL/CSV IMPORT LOGIC ---
    const downloadTemplate = () => {
        const ws = XLSX.utils.json_to_sheet([
            {
                question: 'Example: What is the capital of France?',
                option_a: 'London', option_b: 'Paris', option_c: 'Berlin', option_d: 'Madrid',
                correct_option: 'B', difficulty: 'easy', topic: 'Geography', time_limit: 20, explanation: 'Paris is the capital of France.'
            }
        ]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Questions');
        XLSX.writeFile(wb, 'AptiQuiz_Template.xlsx');
    };

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setFileName(file.name);
        
        const isCsv = file.name.toLowerCase().endsWith('.csv');
        const reader = new FileReader();
        
        reader.onload = (evt) => {
            try {
                const data = evt.target.result;
                const wb = XLSX.read(data, { type: 'binary' });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];
                
                const jsonData = XLSX.utils.sheet_to_json(ws);
                const parsed = [];
                const errors = [];
                
                if (jsonData.length === 0) {
                    setImportErrors(['The uploaded file contains no questions or is completely empty.']);
                    setImportedQuestions([]);
                    return;
                }
                
                // Validate headers loosely
                const hasHeaders = jsonData.some(row => row.question || row.option_a || row.correct_option);
                if (!hasHeaders) {
                    setImportErrors(['Missing required headers. Please download the template and use the exact column names.']);
                    setImportedQuestions([]);
                    return;
                }

                jsonData.forEach((row, idx) => {
                    const rowNum = idx + 2; // Excel row mapping
                    if (row.question && String(row.question).startsWith('Example:')) return; // Skip template row
                    
                    const qText = row.question ? String(row.question).trim() : '';
                    const oa = row.option_a ? String(row.option_a).trim() : '';
                    const ob = row.option_b ? String(row.option_b).trim() : '';
                    const oc = row.option_c ? String(row.option_c).trim() : '';
                    const od = row.option_d ? String(row.option_d).trim() : '';
                    
                    // Skip completely empty rows
                    if (!qText && !oa && !ob && !oc && !od) return;

                    let rowValid = true;
                    if (!qText) { errors.push(`Row ${rowNum}: Question text is required`); rowValid = false; }
                    if (!oa || !ob || !oc || !od) { errors.push(`Row ${rowNum}: All 4 options (A, B, C, D) are required`); rowValid = false; }
                    
                    let correctIndex = 0;
                    const correctRaw = row.correct_option ? String(row.correct_option).trim().toUpperCase() : '';
                    if (['A', 'B', 'C', 'D'].includes(correctRaw)) {
                        correctIndex = ['A', 'B', 'C', 'D'].indexOf(correctRaw);
                    } else {
                        errors.push(`Row ${rowNum}: 'correct_option' must be A, B, C, or D`);
                        rowValid = false;
                    }

                    const diffRaw = row.difficulty ? String(row.difficulty).trim().toLowerCase() : 'medium';
                    if (!['easy', 'medium', 'hard'].includes(diffRaw)) {
                        errors.push(`Row ${rowNum}: 'difficulty' must be easy, medium, or hard`);
                        rowValid = false;
                    }

                    const timeRaw = parseInt(row.time_limit, 10);
                    const timeLimit = (isNaN(timeRaw) || timeRaw < 5) ? 20 : timeRaw;
                    const topic = row.topic ? String(row.topic).trim() : 'General';
                    const explanation = row.explanation ? String(row.explanation).trim() : '';

                    // Check for duplicate question text within the import batch
                    if (parsed.find(p => p.text.toLowerCase() === qText.toLowerCase())) {
                        errors.push(`Row ${rowNum}: Warning - Duplicate question text detected`);
                    }

                    if (rowValid) {
                        parsed.push({
                            text: qText,
                            options: [oa, ob, oc, od],
                            correctOptionIndex: correctIndex,
                            difficulty: diffRaw,
                            topic,
                            timeLimit,
                            explanation,
                            _valid: true
                        });
                    }
                });

                if (parsed.length === 0 && errors.length === 0) {
                    errors.push('No valid questions found. Ensure you are not just uploading the example row.');
                }

                setImportedQuestions(parsed);
                setImportErrors(errors);
            } catch (err) {
                console.error(err);
                setImportErrors(['Failed to parse file. Please ensure it is a valid Excel or CSV.']);
            }
        };

        if (isCsv) {
            reader.readAsText(file);
        } else {
            reader.readAsBinaryString(file);
        }
    };

    // --- PDF IMPORT LOGIC ---
    const handlePdfUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setFileName(file.name);
        
        if (file.type !== 'application/pdf') {
            setPdfError('File must be a PDF.');
            return;
        }

        setPdfProcessing(true);
        setPdfError(null);
        setImportErrors([]);
        setImportedQuestions([]);

        const formData = new FormData();
        formData.append('pdf', file);

        try {
            const data = await api.parsePdf(formData);
            if (data.questions && data.questions.length > 0) {
                setImportedQuestions(data.questions);
            } else {
                setPdfError('No questions could be extracted from this PDF.');
            }
        } catch (err) {
            setPdfError(err.message || 'Failed to parse PDF.');
        } finally {
            setPdfProcessing(false);
        }
    };

    const updateImportedQuestion = (idx, field, value) => {
        const newQ = [...importedQuestions];
        newQ[idx][field] = value;
        // Re-evaluate validity
        let valid = true;
        if (!newQ[idx].text) valid = false;
        if (newQ[idx].options.length < 4 || newQ[idx].options.some(o => !o)) valid = false;
        newQ[idx]._valid = valid;
        setImportedQuestions(newQ);
    };
    
    const updateImportedOption = (qIdx, optIdx, value) => {
        const newQ = [...importedQuestions];
        newQ[qIdx].options[optIdx] = value;
        let valid = true;
        if (!newQ[qIdx].text) valid = false;
        if (newQ[qIdx].options.length < 4 || newQ[qIdx].options.some(o => !o)) valid = false;
        newQ[qIdx]._valid = valid;
        setImportedQuestions(newQ);
    };

    // --- SAVE LOGIC ---
    const handleSave = async (e) => {
        e.preventDefault();
        setError(null);
        
        if (!title) {
            setError('Test title is required.');
            return;
        }

        const activeQuestions = (creationMode === 'import' || creationMode === 'pdf') ? importedQuestions : questions;
        
        // Remove valid flags for backend
        const cleanQuestions = activeQuestions.map(q => ({
            text: q.text,
            options: q.options,
            correctOptionIndex: q.correctOptionIndex,
            difficulty: q.difficulty,
            topic: q.topic,
            timeLimit: q.timeLimit,
            explanation: q.explanation
        }));

        if (cleanQuestions.length === 0) {
            setError('Add at least one question.');
            return;
        }

        setSaving(true);
        try {
            await api.createTest({ title, description, questions: cleanQuestions });
            navigate('/teacher/tests');
        } catch (err) {
            setError(err.message);
            setSaving(false);
        }
    };

    const card = { background: '#1e293b', padding: '2rem', borderRadius: '8px', marginBottom: '1.5rem', border: '1px solid #334155' };
    const inputStyle = { width: '100%', padding: '0.75rem', background: '#0f172a', border: '1px solid #334155', color: 'white', borderRadius: '4px', marginBottom: '1rem', boxSizing: 'border-box' };

    const renderImportPreview = () => (
        <div style={{ marginTop: '2rem' }}>
            {creationMode === 'import' && importErrors.length > 0 && (
                <div style={{ background: '#7f1d1d', color: '#fca5a5', padding: '1rem', borderRadius: '6px', marginBottom: '1rem' }}>
                    <h4 style={{ margin: '0 0 0.5rem' }}>Import Errors / Warnings</h4>
                    <ul style={{ margin: 0, paddingLeft: '1.5rem' }}>
                        {importErrors.map((err, i) => <li key={i}>{err}</li>)}
                    </ul>
                </div>
            )}
            
            {creationMode === 'pdf' && pdfError && (
                <div style={{ background: '#7f1d1d', color: '#fca5a5', padding: '1rem', borderRadius: '6px', marginBottom: '1rem' }}>
                    <h4 style={{ margin: '0 0 0.5rem' }}>PDF Processing Error</h4>
                    <p style={{ margin: 0 }}>{pdfError}</p>
                </div>
            )}

            {importedQuestions.length > 0 && (
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <h4 style={{ color: '#10b981', margin: 0 }}>{importedQuestions.length} Valid Questions Ready</h4>
                        <button type="button" onClick={() => { setImportedQuestions([]); setFileName(''); setImportErrors([]); setPdfError(null); }} style={{
                            padding: '0.4rem 0.8rem', background: '#334155', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer'
                        }}>Clear / Replace File</button>
                    </div>
                    
                    <div style={{ maxHeight: '500px', overflowY: 'auto', background: '#0f172a', padding: '1rem', borderRadius: '6px' }}>
                        {importedQuestions.map((q, idx) => (
                            <div key={idx} style={{ 
                                padding: '1rem', background: '#1e293b', marginBottom: '1rem', borderRadius: '6px', 
                                borderLeft: q._valid ? '4px solid #10b981' : '4px solid #fbbf24'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                                    <strong style={{ color: '#9ca3af' }}>Question {idx + 1} {!q._valid && <span style={{color: '#fbbf24'}}>(Needs Review)</span>}</strong>
                                    <button type="button" onClick={() => setImportedQuestions(importedQuestions.filter((_, i) => i !== idx))} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer' }}>Remove</button>
                                </div>
                                
                                <input style={inputStyle} value={q.text} onChange={e => updateImportedQuestion(idx, 'text', e.target.value)} placeholder="Question Text" />
                                
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                                    {q.options.map((opt, oIdx) => (
                                        <div key={oIdx} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <input type="radio" name={`imp_correct_${idx}`} checked={q.correctOptionIndex === oIdx} onChange={() => updateImportedQuestion(idx, 'correctOptionIndex', oIdx)} />
                                            <input style={{...inputStyle, marginBottom: 0}} value={opt} onChange={e => updateImportedOption(idx, oIdx, e.target.value)} placeholder={`Option ${String.fromCharCode(65+oIdx)}`} />
                                        </div>
                                    ))}
                                </div>
                                <div style={{ display: 'flex', gap: '1rem' }}>
                                    <select style={{...inputStyle, marginBottom: 0, width: '30%'}} value={q.difficulty} onChange={e => updateImportedQuestion(idx, 'difficulty', e.target.value)}>
                                        <option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
                                    </select>
                                    <input style={{...inputStyle, marginBottom: 0, width: '40%'}} value={q.topic} onChange={e => updateImportedQuestion(idx, 'topic', e.target.value)} placeholder="Topic" />
                                    <input type="number" style={{...inputStyle, marginBottom: 0, width: '30%'}} value={q.timeLimit} onChange={e => updateImportedQuestion(idx, 'timeLimit', parseInt(e.target.value))} placeholder="Time (s)" />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );

    return (
        <div style={{ color: 'white' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
                <button type="button" onClick={() => navigate('/teacher')} style={{ background: 'transparent', border: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: '1rem' }}>+? Back</button>
                <h2 style={{ margin: 0 }}>Create New Test</h2>
            </div>
            
            {error && <div style={{ background: '#7f1d1d', color: '#fca5a5', padding: '1rem', borderRadius: '6px', marginBottom: '1.5rem' }}>{error}</div>}
            
            <form onSubmit={handleSave}>
                <div style={card}>
                    <h3 style={{ margin: '0 0 1rem' }}>Test Details</h3>
                    <input style={inputStyle} value={title} onChange={e => setTitle(e.target.value)} placeholder="Test Title (e.g., Spring 2026 Aptitude)" required />
                    <textarea style={{...inputStyle, minHeight: '80px'}} value={description} onChange={e => setDescription(e.target.value)} placeholder="Test Description (Optional)" />
                </div>
                
                {creationMode === 'choose' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1.5rem', marginBottom: '2rem' }}>
                        <div onClick={() => setCreationMode('manual')} style={{...card, cursor: 'pointer', textAlign: 'center', transition: 'transform 0.2s', border: '2px dashed #475569'}}>
                            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✍️</div>
                            <h3>Create Questions Manually</h3>
                            <p style={{ color: '#9ca3af', fontSize: '0.9rem' }}>Type each question, option, and correct answer one by one.</p>
                        </div>
                        <div onClick={() => setCreationMode('import')} style={{...card, cursor: 'pointer', textAlign: 'center', transition: 'transform 0.2s', border: '2px dashed #475569'}}>
                            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📊</div>
                            <h3>Import from Excel / CSV</h3>
                            <p style={{ color: '#9ca3af', fontSize: '0.9rem' }}>Upload a spreadsheet to bulk import questions instantly.</p>
                        </div>
                        <div onClick={() => setCreationMode('pdf')} style={{...card, cursor: 'pointer', textAlign: 'center', transition: 'transform 0.2s', border: '2px dashed #475569'}}>
                            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📄</div>
                            <h3>Import from PDF</h3>
                            <p style={{ color: '#9ca3af', fontSize: '0.9rem' }}>Extract questions and options from a text-based PDF paper.</p>
                        </div>
                    </div>
                )}

                {creationMode === 'import' && (
                    <div style={{...card, border: '1px solid #3b82f6'}}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <h3 style={{ margin: 0, color: '#3b82f6' }}>Bulk Import (Excel / CSV)</h3>
                            <button type="button" onClick={() => { setCreationMode('choose'); setImportedQuestions([]); setFileName(''); setImportErrors([]); }} style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer' }}>Change Mode</button>
                        </div>
                        
                        {!fileName ? (
                            <div style={{ textAlign: 'center', padding: '2rem', border: '2px dashed #475569', borderRadius: '8px' }}>
                                <button type="button" onClick={downloadTemplate} style={{ padding: '0.5rem 1rem', background: '#334155', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', marginBottom: '1rem' }}>⬇️ Download Excel Template</button>
                                <p style={{ color: '#9ca3af', fontSize: '0.9rem', marginBottom: '1.5rem' }}>Fill out the template and upload it here.</p>
                                <label style={{ display: 'inline-block', padding: '0.75rem 1.5rem', background: '#10b981', color: 'white', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                                    Browse File
                                    <input type="file" accept=".xlsx, .xls, .csv" onChange={handleFileUpload} style={{ display: 'none' }} />
                                </label>
                            </div>
                        ) : renderImportPreview()}
                    </div>
                )}
                
                {creationMode === 'pdf' && (
                    <div style={{...card, border: '1px solid #8b5cf6'}}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <h3 style={{ margin: 0, color: '#8b5cf6' }}>PDF Extraction</h3>
                            <button type="button" onClick={() => { setCreationMode('choose'); setImportedQuestions([]); setFileName(''); setPdfError(null); }} style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer' }}>Change Mode</button>
                        </div>
                        
                        {!fileName || (pdfError && importedQuestions.length === 0) ? (
                            <div style={{ textAlign: 'center', padding: '2rem', border: '2px dashed #475569', borderRadius: '8px' }}>
                                <p style={{ color: '#9ca3af', fontSize: '0.9rem', marginBottom: '1.5rem' }}>Upload a text-based PDF question paper (Max 10MB).</p>
                                <label style={{ display: 'inline-block', padding: '0.75rem 1.5rem', background: '#8b5cf6', color: 'white', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                                    {pdfProcessing ? 'Processing PDF...' : 'Browse PDF'}
                                    <input type="file" accept="application/pdf" onChange={handlePdfUpload} style={{ display: 'none' }} disabled={pdfProcessing} />
                                </label>
                            </div>
                        ) : renderImportPreview()}
                    </div>
                )}

                {creationMode === 'manual' && (
                    <div style={{...card, border: '1px solid #3b82f6'}}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <h3 style={{ margin: 0, color: '#3b82f6' }}>Manual Entry</h3>
                            <button type="button" onClick={() => setCreationMode('choose')} style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer' }}>Change Mode</button>
                        </div>
                        {questions.map((q, idx) => (
                            <div key={idx} style={{ background: '#0f172a', padding: '1.5rem', borderRadius: '8px', marginBottom: '1.5rem', border: '1px solid #334155' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                                    <h4 style={{ margin: 0, color: '#9ca3af' }}>Question {idx + 1}</h4>
                                    {questions.length > 1 && (
                                        <button type="button" onClick={() => removeQuestion(idx)} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer' }}>Remove</button>
                                    )}
                                </div>
                                <input style={inputStyle} value={q.text} onChange={e => updateQuestion(idx, 'text', e.target.value)} placeholder="Enter question..." required />
                                
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                                    {q.options.map((opt, oIdx) => (
                                        <div key={oIdx} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <input type="radio" name={`q_${idx}_correct`} checked={q.correctOptionIndex === oIdx} onChange={() => updateQuestion(idx, 'correctOptionIndex', oIdx)} />
                                            <input style={{...inputStyle, marginBottom: 0}} value={opt} onChange={e => updateOption(idx, oIdx, e.target.value)} placeholder={`Option ${String.fromCharCode(65+oIdx)}`} required />
                                        </div>
                                    ))}
                                </div>
                                
                                <div style={{ display: 'flex', gap: '1rem' }}>
                                    <select style={{...inputStyle, marginBottom: 0, width: '30%'}} value={q.difficulty} onChange={e => updateQuestion(idx, 'difficulty', e.target.value)}>
                                        <option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
                                    </select>
                                    <input style={{...inputStyle, marginBottom: 0, width: '40%'}} value={q.topic} onChange={e => updateQuestion(idx, 'topic', e.target.value)} placeholder="Topic (e.g. Math)" />
                                    <input type="number" style={{...inputStyle, marginBottom: 0, width: '30%'}} value={q.timeLimit} onChange={e => updateQuestion(idx, 'timeLimit', parseInt(e.target.value))} placeholder="Time Limit (sec)" />
                                </div>
                            </div>
                        ))}
                        <button type="button" onClick={addQuestion} style={{ padding: '0.75rem 1.5rem', background: '#334155', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', width: '100%' }}>+ Add Another Question</button>
                    </div>
                )}
                
                {creationMode !== 'choose' && (
                    <div style={{ textAlign: 'right' }}>
                        <button type="submit" disabled={saving || ((creationMode === 'import' || creationMode === 'pdf') && importedQuestions.length === 0)} style={{
                            padding: '1rem 2.5rem', background: ((creationMode === 'import' || creationMode === 'pdf') && importedQuestions.length === 0) ? '#475569' : '#10b981', 
                            color: 'white', border: 'none', borderRadius: '6px', cursor: ((creationMode === 'import' || creationMode === 'pdf') && importedQuestions.length === 0) ? 'not-allowed' : 'pointer', fontSize: '1.1rem', fontWeight: 'bold'
                        }}>
                            {saving ? 'Saving...' : (creationMode === 'import' || creationMode === 'pdf') ? `Create Test with ${importedQuestions.length} Questions` : 'Save Test'}
                        </button>
                    </div>
                )}
            </form>
        </div>
    );
}
"""

content = content[:start_idx] + new_create_test + '\n\n' + content[end_idx:]

with open('client/src/pages/TeacherDashboard.jsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("Patched CreateTest component successfully.")
