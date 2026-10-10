import React, { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, Link } from 'react-router-dom';
import { api } from '../api';
import * as XLSX from 'xlsx';
import HostLobby from './HostLobby';
import HostSettings from './HostSettings';

// ─── Teacher auth guard ───────────────────────────────────────────────────────

function useTeacherAuth() {
    const navigate = useNavigate();
    const token = localStorage.getItem('teacherToken');
    const name = localStorage.getItem('teacherName');

    useEffect(() => {
        if (!token) {
            navigate('/teacher/login');
            return;
        }
        // Verify token is still valid
        api.me().catch(() => {
            localStorage.removeItem('teacherToken');
            localStorage.removeItem('teacherName');
            navigate('/teacher/login');
        });
    }, [token, navigate]);

    return { token, name };
}

function logout(navigate) {
    localStorage.removeItem('teacherToken');
    localStorage.removeItem('teacherName');
    navigate('/teacher/login');
}

// ─── Layout ───────────────────────────────────────────────────────────────────

function SidebarLayout({ name, navigate, children }) {
    const location = window.location.pathname;
    const navItems = [
        { path: '/teacher', label: 'Overview', icon: '📊' },
        { path: '/teacher/tests', label: 'My Tests', icon: '📝' },
        { path: '/teacher/active', label: 'Active Rooms', icon: '🚀' },
        { path: '/teacher/completed', label: 'Completed Tests', icon: '✅' },
    ];

    return (
        <div style={{ display: 'flex', minHeight: '100vh', background: '#0f172a', color: 'white' }}>
            {/* Sidebar */}
            <aside style={{ width: '250px', background: '#1e293b', borderRight: '1px solid #334155', display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '1.5rem', borderBottom: '1px solid #334155' }}>
                    <Link to="/teacher" style={{ color: 'white', textDecoration: 'none', fontSize: '1.3rem', fontWeight: 'bold' }}>
                        AptiQuiz Teacher
                    </Link>
                </div>
                <nav style={{ flex: 1, padding: '1rem 0' }}>
                    {navItems.map(item => (
                        <Link key={item.path} to={item.path} style={{
                            display: 'block', padding: '1rem 1.5rem', color: location === item.path || (item.path !== '/teacher' && location.startsWith(item.path)) ? '#3b82f6' : '#9ca3af',
                            textDecoration: 'none', background: location === item.path || (item.path !== '/teacher' && location.startsWith(item.path)) ? '#0f172a' : 'transparent',
                            borderLeft: `4px solid ${location === item.path || (item.path !== '/teacher' && location.startsWith(item.path)) ? '#3b82f6' : 'transparent'}`,
                            fontWeight: location === item.path || (item.path !== '/teacher' && location.startsWith(item.path)) ? 'bold' : 'normal',
                            transition: 'all 0.2s'
                        }}>
                            <span style={{ marginRight: '0.75rem' }}>{item.icon}</span> {item.label}
                        </Link>
                    ))}
                </nav>
            </aside>
            
            {/* Main Content */}
            <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <header style={{ padding: '1rem 2rem', background: '#1e293b', borderBottom: '1px solid #334155', display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <span style={{ color: '#9ca3af', fontSize: '0.9rem' }}>👤 {name}</span>
                        <button onClick={() => logout(navigate)} style={{
                            padding: '0.4rem 0.9rem', background: 'transparent', border: '1px solid #475569', color: '#9ca3af', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem'
                        }}>Sign Out</button>
                    </div>
                </header>
                <div style={{ flex: 1, overflowY: 'auto', padding: '2rem' }}>
                    <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
                        {children}
                    </div>
                </div>
            </main>
        </div>
    );
}

// ─── Test List ────────────────────────────────────────────────────────────────

function TestList() {
    const navigate = useNavigate();
    useTeacherAuth();
    const [dashboard, setDashboard] = useState({ tests: [], activeRooms: [], completedRooms: [] });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        api.getTeacherDashboard()
            .then(data => { setDashboard(data); setLoading(false); })
            .catch(err => { setError(err.message); setLoading(false); });
    }, []);

    if (loading) return <div style={{ padding: '2rem', color: '#9ca3af' }}>Loading your dashboard...</div>;
    if (error) return <div style={{ padding: '2rem', color: '#fca5a5' }}>Error: {error}</div>;

    const { tests, activeRooms, completedRooms } = dashboard;

    const location = window.location.pathname;
    const isOverview = location === '/teacher';
    const isMyTests = location === '/teacher/tests';
    const isActive = location === '/teacher/active';
    const isCompleted = location === '/teacher/completed';

    const renderTests = () => (
        <div style={{ marginBottom: '2rem' }}>
            <h3 style={{ color: '#9ca3af', textTransform: 'uppercase', fontSize: '0.9rem', marginBottom: '1rem' }}>My Tests</h3>
            {tests.length === 0 ? (
                <div style={{ padding: '3rem', background: '#1e293b', borderRadius: '12px', textAlign: 'center', color: '#9ca3af' }}>
                    <p>No tests yet.</p>
                    <p style={{ fontSize: '0.9rem' }}>Click "Create New Test" to build your first aptitude test.</p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {tests.map(test => (
                        <div key={test.id} style={{
                            padding: '1.5rem', background: '#1e293b', borderRadius: '8px',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            borderLeft: '4px solid #3b82f6'
                        }}>
                            <div>
                                <h3 style={{ margin: '0 0 0.4rem', color: 'white' }}>{test.title}</h3>
                                <p style={{ margin: 0, color: '#9ca3af', fontSize: '0.85rem' }}>
                                    {test.question_count} question{test.question_count !== 1 ? 's' : ''}
                                    {test.description ? ` · ${test.description}` : ''}
                                </p>
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button onClick={() => navigate(`/teacher/test/${test.id}/analytics`)} style={{
                                    padding: '0.6rem 1.2rem', background: '#4f46e5', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold'
                                }}>📊 Analytics</button>
                                <button onClick={() => navigate(`/teacher/test/${test.id}/setup`)} style={{
                                    padding: '0.6rem 1.2rem', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold'
                                }}>🚀 Host Room</button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );

    const renderActive = () => (
        <div style={{ marginBottom: '2rem' }}>
            <h3 style={{ color: '#9ca3af', textTransform: 'uppercase', fontSize: '0.9rem', marginBottom: '1rem' }}>Active Rooms</h3>
            {activeRooms.length === 0 ? (
                <div style={{ padding: '1.5rem', background: '#1e293b', borderRadius: '8px', color: '#64748b', fontSize: '0.9rem' }}>
                    No active rooms right now.
                </div>
            ) : (
                <div style={{ display: 'grid', gap: '1rem' }}>
                    {activeRooms.map(room => (
                        <div key={room.id} style={{
                            padding: '1.2rem', background: '#1e293b', borderRadius: '8px',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            borderLeft: '4px solid #10b981'
                        }}>
                            <div>
                                <h4 style={{ margin: '0 0 0.25rem', color: 'white' }}>{room.test_title}</h4>
                                <div style={{ color: '#9ca3af', fontSize: '0.85rem' }}>Code: <strong style={{color: 'white', letterSpacing: '1px'}}>{room.code}</strong> • {room.participant_count} participants</div>
                            </div>
                            <button onClick={() => navigate(`/teacher/test/${room.id}/host`)} style={{
                                padding: '0.5rem 1rem', background: 'transparent', color: '#3b82f6', border: '1px solid #3b82f6', borderRadius: '4px', cursor: 'pointer'
                            }}>Rejoin Lobby</button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );

    const renderCompleted = () => (
        <div>
            <h3 style={{ color: '#9ca3af', textTransform: 'uppercase', fontSize: '0.9rem', marginBottom: '1rem' }}>Recent Activity</h3>
            {completedRooms.length === 0 ? (
                <div style={{ padding: '1.5rem', background: '#1e293b', borderRadius: '8px', color: '#64748b', fontSize: '0.9rem' }}>
                    No completed rooms.
                </div>
            ) : (
                <div style={{ display: 'grid', gap: '1rem' }}>
                    {completedRooms.map(room => (
                        <div key={room.id} style={{
                            padding: '1.2rem', background: '#1e293b', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderLeft: '4px solid #4f46e5'
                        }}>
                            <div>
                                <h4 style={{ margin: '0 0 0.25rem', color: 'white' }}>{room.test_title}</h4>
                                <div style={{ color: '#9ca3af', fontSize: '0.85rem' }}>Completed on {new Date(room.created_at).toLocaleDateString()}</div>
                            </div>
                            <div style={{ color: '#10b981', fontWeight: 'bold' }}>{room.participant_count} Students</div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );

    return (
        <div style={{ padding: '0', maxWidth: '1000px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <h2 style={{ color: 'white', margin: 0 }}>
                    {isOverview ? 'Overview' : isMyTests ? 'My Tests' : isActive ? 'Active Rooms' : 'Completed Tests'}
                </h2>
                <button onClick={() => navigate('/teacher/create')} style={{
                    padding: '0.75rem 1.5rem', background: '#10b981', color: 'white',
                    border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold'
                }}>+ Create New Test</button>
            </div>

            {isOverview && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
                    <div style={{ padding: '1.5rem', background: '#1e293b', borderRadius: '8px', borderLeft: '4px solid #3b82f6' }}>
                        <h3 style={{ margin: '0 0 0.5rem', color: '#9ca3af', fontSize: '0.9rem' }}>TOTAL TESTS</h3>
                        <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'white' }}>{tests.length}</div>
                    </div>
                    <div style={{ padding: '1.5rem', background: '#1e293b', borderRadius: '8px', borderLeft: '4px solid #10b981' }}>
                        <h3 style={{ margin: '0 0 0.5rem', color: '#9ca3af', fontSize: '0.9rem' }}>ACTIVE ROOMS</h3>
                        <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'white' }}>{activeRooms.length}</div>
                    </div>
                    <div style={{ padding: '1.5rem', background: '#1e293b', borderRadius: '8px', borderLeft: '4px solid #4f46e5' }}>
                        <h3 style={{ margin: '0 0 0.5rem', color: '#9ca3af', fontSize: '0.9rem' }}>COMPLETED</h3>
                        <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'white' }}>{completedRooms.length}</div>
                    </div>
                </div>
            )}

            {(isOverview || isActive) && renderActive()}
            {(isOverview || isCompleted) && renderCompleted()}
            {(isOverview || isMyTests) && renderTests()}
        </div>
    );
}

// ─── Create Test ──────────────────────────────────────────────────────────────

function CreateTest() {
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
    const [fileSize, setFileSize] = useState(0);
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
        setFileSize(file.size);
        
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
        setFileSize(file.size);
        
        if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
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
            {fileName && (
                <div style={{ background: '#334155', padding: '0.75rem', borderRadius: '6px', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#e2e8f0' }}>File: <strong>{fileName}</strong></span>
                    <span style={{ color: '#9ca3af' }}>{(fileSize / 1024).toFixed(1)} KB</span>
                </div>
            )}
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
                                    <input type="file" accept=".pdf, application/pdf" onChange={handlePdfUpload} style={{ display: 'none' }} disabled={pdfProcessing} />
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


function TestAnalytics() {
    const { testId } = useParams();
    const navigate = useNavigate();
    useTeacherAuth();
    const [results, setResults] = useState([]);
    const [questionStats, setQuestionStats] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        Promise.all([
            api.getTestAnalytics(testId),
            api.getQuestionAnalytics(testId)
        ])
            .then(([resData, qData]) => { 
                setResults(resData); 
                setQuestionStats(qData);
                setLoading(false); 
            })
            .catch(err => { setError(err.message); setLoading(false); });
    }, [testId]);

    if (loading) return <div style={{ padding: '2rem', color: '#9ca3af' }}>Loading analytics...</div>;
    if (error) return <div style={{ padding: '2rem', color: '#fca5a5' }}>Error: {error}</div>;

    const topicMap = {};
    results.forEach(r => {
        const stats = r.topic_stats;
        for (const topic in stats) {
            if (!topicMap[topic]) topicMap[topic] = { attempted: 0, correct: 0 };
            topicMap[topic].attempted += stats[topic].attempted;
            topicMap[topic].correct += stats[topic].correct;
        }
    });

    const exportToCSV = () => {
        const headers = ['Date', 'Student', 'Score', 'Accuracy (%)'];
        const rows = results.map(r => [new Date(r.run_date).toLocaleString(), r.display_name, r.total_score, r.accuracy_percent]);
        const csvContent = "data:text/csv;charset=utf-8," + [headers, ...rows].map(e => e.join(",")).join("\n");
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `AptiQuiz_Results_${testId}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const exportQuestionsCSV = () => {
        const headers = ['Question', 'Topic', 'Difficulty', 'Total Answers', 'Correct', 'Incorrect', 'Timeouts', 'Avg Time (ms)'];
        const rows = questionStats.map(q => [
            `"${q.question_text.replace(/"/g, '""')}"`, 
            q.topic, 
            q.difficulty, 
            q.total_answers, 
            q.correct_answers, 
            q.incorrect_answers, 
            q.timeouts, 
            q.avg_response_time_ms || 0
        ]);
        const csvContent = "data:text/csv;charset=utf-8," + [headers, ...rows].map(e => e.join(",")).join("\n");
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `AptiQuiz_Questions_${testId}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div style={{ padding: '2rem', maxWidth: '1000px', margin: '0 auto', color: 'white' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
                <button onClick={() => navigate('/teacher')} style={ghostBtn}>← Back</button>
                <h2 style={{ margin: 0 }}>Test Analytics</h2>
            </div>
            
            <div style={{ display: 'flex', gap: '2rem', marginBottom: '2rem' }}>
                <div style={{ ...card, flex: 1, textAlign: 'center' }}>
                    <h3 style={{ color: '#9ca3af', margin: '0 0 0.5rem', fontSize: '0.9rem', textTransform: 'uppercase' }}>Total Attempts</h3>
                    <div style={{ fontSize: '2.5rem', fontWeight: 'bold' }}>{results.length}</div>
                </div>
                <div style={{ ...card, flex: 1, textAlign: 'center' }}>
                    <h3 style={{ color: '#9ca3af', margin: '0 0 0.5rem', fontSize: '0.9rem', textTransform: 'uppercase' }}>Average Score</h3>
                    <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#10b981' }}>
                        {results.length > 0 ? Math.round(results.reduce((s, r) => s + r.total_score, 0) / results.length) : 0}
                    </div>
                </div>
            </div>

            <div style={{ ...card, marginBottom: '2rem' }}>
                <h3 style={{ marginTop: 0, marginBottom: '1rem' }}>Topic Accuracy (Aggregated)</h3>
                {Object.keys(topicMap).length === 0 ? <p style={{ color: '#9ca3af' }}>No topic data available yet.</p> : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
                        {Object.entries(topicMap).map(([topic, data]) => {
                            const acc = data.attempted > 0 ? Math.round((data.correct / data.attempted) * 100) : 0;
                            return (
                                <div key={topic} style={{ background: '#334155', padding: '1rem', borderRadius: '6px' }}>
                                    <div style={{ fontSize: '0.9rem', color: '#9ca3af', marginBottom: '0.5rem' }}>{topic}</div>
                                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: acc > 70 ? '#10b981' : acc < 40 ? '#ef4444' : '#fbbf24' }}>
                                        {acc}%
                                    </div>
                                    <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.25rem' }}>{data.correct} / {data.attempted} correct</div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            <div style={{ ...card, marginBottom: '2rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h3 style={{ margin: 0 }}>Question Difficulty Analysis</h3>
                    <button onClick={exportQuestionsCSV} disabled={questionStats.length === 0} style={{
                        padding: '0.5rem 1rem', background: questionStats.length === 0 ? '#475569' : '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', cursor: questionStats.length === 0 ? 'not-allowed' : 'pointer'
                    }}>Export Questions CSV</button>
                </div>
                
                {questionStats.length === 0 ? <p style={{ color: '#9ca3af' }}>No question analytics available yet.</p> : (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '800px' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid #475569', color: '#9ca3af' }}>
                                    <th style={{ padding: '0.75rem 0.5rem', width: '35%' }}>Question</th>
                                    <th style={{ padding: '0.75rem 0.5rem' }}>Total</th>
                                    <th style={{ padding: '0.75rem 0.5rem', color: '#10b981' }}>Correct</th>
                                    <th style={{ padding: '0.75rem 0.5rem', color: '#ef4444' }}>Incorrect</th>
                                    <th style={{ padding: '0.75rem 0.5rem', color: '#fbbf24' }}>Timeouts</th>
                                    <th style={{ padding: '0.75rem 0.5rem' }}>Avg Time</th>
                                    <th style={{ padding: '0.75rem 0.5rem' }}>Accuracy</th>
                                </tr>
                            </thead>
                            <tbody>
                                {questionStats.map((q, i) => {
                                    const total = parseInt(q.total_answers) || 0;
                                    const correct = parseInt(q.correct_answers) || 0;
                                    const acc = total > 0 ? Math.round((correct / total) * 100) : 0;
                                    return (
                                        <tr key={i} style={{ borderBottom: '1px solid #334155', background: acc < 30 ? 'rgba(239, 68, 68, 0.1)' : 'transparent' }}>
                                            <td style={{ padding: '0.75rem 0.5rem' }}>
                                                <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '300px' }} title={q.question_text}>
                                                    {q.question_text}
                                                </div>
                                                <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.2rem' }}>
                                                    {q.topic} • {q.difficulty}
                                                </div>
                                            </td>
                                            <td style={{ padding: '0.75rem 0.5rem' }}>{total}</td>
                                            <td style={{ padding: '0.75rem 0.5rem', color: '#10b981' }}>{correct}</td>
                                            <td style={{ padding: '0.75rem 0.5rem', color: '#ef4444' }}>{q.incorrect_answers}</td>
                                            <td style={{ padding: '0.75rem 0.5rem', color: '#fbbf24' }}>{q.timeouts}</td>
                                            <td style={{ padding: '0.75rem 0.5rem' }}>{q.avg_response_time_ms ? `${(q.avg_response_time_ms / 1000).toFixed(1)}s` : '-'}</td>
                                            <td style={{ padding: '0.75rem 0.5rem', fontWeight: 'bold', color: acc > 70 ? '#10b981' : acc < 40 ? '#ef4444' : '#fbbf24' }}>
                                                {acc}%
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <div style={{ ...card }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h3 style={{ margin: 0 }}>All Individual Results</h3>
                    <button onClick={exportToCSV} disabled={results.length === 0} style={{
                        padding: '0.5rem 1rem', background: results.length === 0 ? '#475569' : '#10b981', color: 'white', border: 'none', borderRadius: '4px', cursor: results.length === 0 ? 'not-allowed' : 'pointer'
                    }}>Download CSV</button>
                </div>
                {results.length === 0 ? <p style={{ color: '#9ca3af' }}>No students have completed this test yet.</p> : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid #475569', color: '#9ca3af' }}>
                                <th style={{ padding: '0.75rem 0' }}>Date</th>
                                <th style={{ padding: '0.75rem 0' }}>Student</th>
                                <th style={{ padding: '0.75rem 0' }}>Score</th>
                                <th style={{ padding: '0.75rem 0' }}>Accuracy</th>
                            </tr>
                        </thead>
                        <tbody>
                            {results.map((r, i) => (
                                <tr key={i} style={{ borderBottom: '1px solid #334155' }}>
                                    <td style={{ padding: '0.75rem 0' }}>{new Date(r.run_date).toLocaleDateString()}</td>
                                    <td style={{ padding: '0.75rem 0' }}>{r.display_name}</td>
                                    <td style={{ padding: '0.75rem 0', color: '#10b981', fontWeight: 'bold' }}>{r.total_score}</td>
                                    <td style={{ padding: '0.75rem 0' }}>{Number(r.accuracy_percent)}%</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}

// ─── Completed Tests View ───────────────────────────────────────────────────

function CompletedTests() {
    const navigate = useNavigate();
    useTeacherAuth();
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.getTeacherHistory()
            .then(data => { setHistory(data); setLoading(false); })
            .catch(() => setLoading(false));
    }, []);

    if (loading) return <div style={{ padding: '2rem', color: '#9ca3af' }}>Loading history...</div>;

    return (
        <div>
            <h2 style={{ color: 'white', marginBottom: '2rem' }}>Completed Tests History</h2>
            {history.length === 0 ? (
                <div style={{ padding: '2rem', background: '#1e293b', borderRadius: '8px', color: '#9ca3af' }}>No completed tests found.</div>
            ) : (
                <div style={{ display: 'grid', gap: '1rem' }}>
                    {history.map(room => (
                        <div key={room.room_id} onClick={() => navigate(`/teacher/results/${room.room_id}`)} style={{
                            padding: '1.5rem', background: '#1e293b', borderRadius: '8px', cursor: 'pointer',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderLeft: '4px solid #10b981'
                        }}>
                            <div>
                                <h3 style={{ margin: '0 0 0.5rem', color: 'white' }}>{room.test_title}</h3>
                                <p style={{ margin: 0, color: '#9ca3af', fontSize: '0.9rem' }}>
                                    Completed on {new Date(room.created_at).toLocaleString()} • Code: {room.code}
                                </p>
                            </div>
                            <div style={{ display: 'flex', gap: '2rem', textAlign: 'center' }}>
                                <div>
                                    <div style={{ fontSize: '0.8rem', color: '#9ca3af', textTransform: 'uppercase' }}>Participants</div>
                                    <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'white' }}>{room.participant_count}</div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.8rem', color: '#9ca3af', textTransform: 'uppercase' }}>Avg Score</div>
                                    <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#3b82f6' }}>{Math.round(room.avg_score || 0)}</div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.8rem', color: '#9ca3af', textTransform: 'uppercase' }}>Highest</div>
                                    <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#fbbf24' }}>{room.highest_score || 0}</div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ─── Teacher Room Results View ─────────────────────────────────────────────

function TeacherResultDetails() {
    const navigate = useNavigate();
    const { roomId } = window.location.pathname.match(/\/teacher\/results\/(.+)/)?.groups || { roomId: window.location.pathname.split('/').pop() };
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        api.getTeacherRoomResults(roomId)
            .then(res => { setData(res); setLoading(false); })
            .catch(err => { setError(err.message); setLoading(false); });
    }, [roomId]);

    if (loading) return <div style={{ color: '#9ca3af', padding: '2rem' }}>Loading results...</div>;
    if (error) return <div style={{ color: '#ef4444', padding: '2rem' }}>Error: {error}</div>;
    if (!data) return null;

    const { room, stats, leaderboard, questionStats } = data;

    return (
        <div>
            <button onClick={() => navigate('/teacher/completed')} style={{
                background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: 0, marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem'
            }}>
                ← Back to History
            </button>
            <div style={{ background: '#1e293b', padding: '2rem', borderRadius: '12px', marginBottom: '2rem' }}>
                <h2 style={{ color: 'white', margin: '0 0 0.5rem 0' }}>{room.test_title}</h2>
                <p style={{ color: '#9ca3af', margin: '0 0 2rem 0' }}>Completed on {new Date(room.created_at).toLocaleString()} • Code: {room.code}</p>
                
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1.5rem' }}>
                    <div>
                        <div style={{ fontSize: '0.9rem', color: '#9ca3af', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Participants</div>
                        <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'white' }}>{stats.totalParticipants}</div>
                    </div>
                    <div>
                        <div style={{ fontSize: '0.9rem', color: '#9ca3af', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Avg Score</div>
                        <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#3b82f6' }}>{stats.avgScore}</div>
                    </div>
                    <div>
                        <div style={{ fontSize: '0.9rem', color: '#9ca3af', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Highest Score</div>
                        <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#fbbf24' }}>{stats.highestScore}</div>
                    </div>
                    <div>
                        <div style={{ fontSize: '0.9rem', color: '#9ca3af', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Avg Accuracy</div>
                        <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#10b981' }}>{stats.avgAccuracy}%</div>
                    </div>
                </div>
            </div>

            <h3 style={{ color: 'white', marginBottom: '1rem' }}>Student Leaderboard</h3>
            <div style={{ background: '#1e293b', borderRadius: '12px', padding: '1rem', marginBottom: '2rem', overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', color: 'white' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid #334155', color: '#9ca3af' }}>
                            <th style={{ padding: '1rem' }}>Rank</th>
                            <th style={{ padding: '1rem' }}>Name</th>
                            <th style={{ padding: '1rem' }}>Score</th>
                            <th style={{ padding: '1rem' }}>Accuracy</th>
                            <th style={{ padding: '1rem' }}>Correct</th>
                        </tr>
                    </thead>
                    <tbody>
                        {leaderboard.map((row, i) => (
                            <tr key={i} style={{ borderBottom: '1px solid #334155' }}>
                                <td style={{ padding: '1rem', color: i === 0 ? '#fbbf24' : 'white' }}>#{row.rank}</td>
                                <td style={{ padding: '1rem' }}>{row.display_name}</td>
                                <td style={{ padding: '1rem', color: '#10b981', fontWeight: 'bold' }}>{row.total_score}</td>
                                <td style={{ padding: '1rem' }}>{Number(row.accuracy_percent)}%</td>
                                <td style={{ padding: '1rem' }}>{row.correct} / {row.attempted}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <h3 style={{ color: 'white', marginBottom: '1rem' }}>Question Analytics</h3>
            <div style={{ background: '#1e293b', borderRadius: '12px', padding: '1rem', overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', color: 'white' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid #334155', color: '#9ca3af' }}>
                            <th style={{ padding: '1rem', width: '40%' }}>Question</th>
                            <th style={{ padding: '1rem' }}>Topic</th>
                            <th style={{ padding: '1rem' }}>Answers</th>
                            <th style={{ padding: '1rem' }}>Correct</th>
                            <th style={{ padding: '1rem' }}>Accuracy</th>
                        </tr>
                    </thead>
                    <tbody>
                        {questionStats.map((q, i) => {
                            const acc = q.answers_count > 0 ? Math.round((q.correct_count / q.answers_count) * 100) : 0;
                            return (
                                <tr key={i} style={{ borderBottom: '1px solid #334155' }}>
                                    <td style={{ padding: '1rem' }}>{q.question_text}</td>
                                    <td style={{ padding: '1rem', color: '#9ca3af' }}>{q.topic || '-'}</td>
                                    <td style={{ padding: '1rem' }}>{q.answers_count}</td>
                                    <td style={{ padding: '1rem', color: '#10b981' }}>{q.correct_count}</td>
                                    <td style={{ padding: '1rem', fontWeight: 'bold', color: acc > 70 ? '#10b981' : acc < 40 ? '#ef4444' : '#fbbf24' }}>{acc}%</td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// ─── Dashboard shell ──────────────────────────────────────────────────────────

export default function TeacherDashboard() {
    const name = localStorage.getItem('teacherName') || 'Teacher';
    const navigate = useNavigate();

    return (
        <SidebarLayout name={name} navigate={navigate}>
            <Routes>
                <Route path="/" element={<TestList />} />
                <Route path="/tests" element={<TestList />} />
                <Route path="/active" element={<TestList />} />
                <Route path="/completed" element={<CompletedTests />} />
                <Route path="/results/:roomId" element={<TeacherResultDetails />} />
                <Route path="/create" element={<CreateTest />} />
                <Route path="/test/:testId/setup" element={<HostSettings />} />
                <Route path="/test/:testId/host" element={<HostLobby />} />
                <Route path="/test/:testId/analytics" element={<TestAnalytics />} />
            </Routes>
        </SidebarLayout>
    );
}
