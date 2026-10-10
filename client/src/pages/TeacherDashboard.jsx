import React, { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, Link } from 'react-router-dom';
import { api } from '../api';
import * as XLSX from 'xlsx';
import HostLobby from './HostLobby';

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
                                <button onClick={() => navigate(`/teacher/test/${test.id}/host`)} style={{
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

    const [creationMode, setCreationMode] = useState('choose'); // choose, manual, import
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    
    // Manual mode state
    const [questions, setQuestions] = useState([makeBlankQuestion()]);
    
    // Import mode state
    const [fileRows, setFileRows] = useState([]);
    const [importErrors, setImportErrors] = useState([]);
    const [importValidCount, setImportValidCount] = useState(0);

    const [error, setError] = useState(null);
    const [saving, setSaving] = useState(false);

    function makeBlankQuestion() {
        return {
            text: '', topic: 'Logical Reasoning', difficulty: 'medium',
            options: ['', '', '', ''], correctOptionIndex: 0, explanation: '', timeLimit: 20,
        };
    }

    const addQuestion = () => setQuestions([...questions, makeBlankQuestion()]);
    const updateQuestion = (i, field, value) => {
        const q = [...questions];
        q[i] = { ...q[i], [field]: value };
        setQuestions(q);
    };
    const updateOption = (qi, oi, value) => {
        const q = [...questions];
        q[qi].options = [...q[qi].options];
        q[qi].options[oi] = value;
        setQuestions(q);
    };
    const moveQuestion = (from, to) => {
        const q = [...questions];
        const [item] = q.splice(from, 1);
        q.splice(to, 0, item);
        setQuestions(q);
    };
    const removeQuestion = (i) => setQuestions(questions.filter((_, idx) => idx !== i));

    const downloadTemplate = () => {
        const ws = XLSX.utils.json_to_sheet([
            {
                question: 'Example: What is the capital of France?',
                option_a: 'Paris',
                option_b: 'London',
                option_c: 'Berlin',
                option_d: 'Rome',
                correct_option: 'A',
                difficulty: 'easy',
                topic: 'Geography',
                time_limit: 20,
                explanation: 'Paris is the capital of France.'
            }
        ]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Questions');
        XLSX.writeFile(wb, 'AptiQuiz_Template.xlsx');
    };

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const bstr = evt.target.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];
                const data = XLSX.utils.sheet_to_json(ws);
                
                const parsedQuestions = [];
                const errors = [];
                let validCount = 0;

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

                    if (!qText && !oa && !ob && !oc && !od) return; 

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
                    
                    if (rowValid) {
                        validCount++;
                    }

                    // Check for duplicate questions within the uploaded file
                    if (parsedQuestions.find(q => q.text.toLowerCase() === qText.toLowerCase())) {
                        errors.push(`Row ${rowNum}: Duplicate question detected within file`);
                        rowValid = false;
                    }

                    parsedQuestions.push({
                        text: qText,
                        options: options,
                        correctOptionIndex: correctIndex,
                        difficulty: diffRaw,
                        topic: topic,
                        timeLimit: timeLimit,
                        explanation: explanation
                    });
                });
                
                if (parsedQuestions.length === 0) {
                    errors.push('No questions found in the file.');
                }
                
                setImportErrors(errors);
                setFileRows(parsedQuestions);
                setImportValidCount(validCount);

            } catch (err) {
                setImportErrors([`Failed to parse file: ${err.message}`]);
            }
        };
        reader.readAsBinaryString(file);
    };

    const handleSave = async (qs) => {
        setError(null);
        if (!title.trim()) return setError('Test title is required');
        if (qs.length === 0) return setError('At least one question is required');

        for (let i = 0; i < qs.length; i++) {
            const q = qs[i];
            if (!q.text.trim()) return setError(`Question ${i + 1}: text is required`);
            if (q.options.some(o => !o.trim())) return setError(`Question ${i + 1}: all options must be filled`);
            const unique = new Set(q.options.map(o => o.trim().toLowerCase()));
            if (unique.size !== q.options.length) return setError(`Question ${i + 1}: duplicate options not allowed`);
        }

        setSaving(true);
        try {
            await api.createTest({ title, description, questions: qs });
            navigate('/teacher');
        } catch (err) {
            setError(err.message);
            setSaving(false);
        }
    };

    return (
        <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto', color: 'white' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
                <button onClick={() => navigate('/teacher')} style={ghostBtn}>← Back</button>
                <h2 style={{ margin: 0 }}>Create New Test</h2>
            </div>

            {error && (
                <div style={{
                    padding: '0.75rem', background: '#ef444420', border: '1px solid #ef4444',
                    color: '#fca5a5', borderRadius: '6px', marginBottom: '1.5rem'
                }}>{error}</div>
            )}

            <div style={{ ...card, marginBottom: '2rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <input
                    type="text" placeholder="Test title (e.g. Campus Placement Mock - Batch 2026)"
                    value={title} onChange={e => setTitle(e.target.value)}
                    style={{ ...inputStyle, fontSize: '1.1rem' }}
                />
                <textarea
                    placeholder="Optional description"
                    value={description} onChange={e => setDescription(e.target.value)}
                    style={{ ...inputStyle, minHeight: '70px', resize: 'vertical' }}
                />
            </div>

            {creationMode === 'choose' && (
                <div style={{ display: 'flex', gap: '1.5rem', justifyContent: 'center', marginTop: '3rem' }}>
                    <button onClick={() => setCreationMode('manual')} style={{
                        padding: '2rem', background: '#3b82f6', color: 'white', border: 'none',
                        borderRadius: '8px', cursor: 'pointer', fontSize: '1.2rem', fontWeight: 'bold', width: '300px'
                    }}>
                        Create Questions Manually
                    </button>
                    <button onClick={() => setCreationMode('import')} style={{
                        padding: '2rem', background: '#10b981', color: 'white', border: 'none',
                        borderRadius: '8px', cursor: 'pointer', fontSize: '1.2rem', fontWeight: 'bold', width: '300px'
                    }}>
                        Import from Excel/CSV
                    </button>
                </div>
            )}

            {creationMode === 'import' && (
                <div style={{ ...card }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                        <h3 style={{ margin: 0 }}>Import Questions</h3>
                        <button onClick={downloadTemplate} style={{ ...ghostBtn, borderColor: '#10b981', color: '#10b981' }}>
                            Download Excel Template
                        </button>
                    </div>
                    
                    <div style={{ padding: '2rem', border: '2px dashed #475569', borderRadius: '8px', textAlign: 'center', marginBottom: '1.5rem' }}>
                        <input type="file" accept=".xlsx, .xls, .csv" onChange={handleFileUpload} style={{ color: '#9ca3af' }} />
                    </div>

                    {importErrors.length > 0 && (
                        <div style={{ background: '#ef444420', padding: '1rem', borderRadius: '6px', marginBottom: '1.5rem' }}>
                            <strong style={{ color: '#ef4444' }}>Found {importErrors.length} errors:</strong>
                            <ul style={{ color: '#fca5a5', margin: '0.5rem 0 0', paddingLeft: '1.5rem', fontSize: '0.9rem' }}>
                                {importErrors.map((err, i) => <li key={i}>{err}</li>)}
                            </ul>
                        </div>
                    )}

                    {fileRows.length > 0 && importErrors.length === 0 && (
                        <div style={{ marginBottom: '1.5rem' }}>
                            <h4 style={{ color: '#10b981' }}>✓ Found {importValidCount} valid questions</h4>
                            <div style={{ overflowX: 'auto', background: '#334155', borderRadius: '6px', padding: '1rem', marginTop: '1rem' }}>
                                <table style={{ width: '100%', fontSize: '0.85rem', textAlign: 'left', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr style={{ color: '#9ca3af', borderBottom: '1px solid #475569' }}>
                                            <th style={{ padding: '0.5rem' }}>Question</th>
                                            <th style={{ padding: '0.5rem' }}>A</th>
                                            <th style={{ padding: '0.5rem' }}>B</th>
                                            <th style={{ padding: '0.5rem' }}>C</th>
                                            <th style={{ padding: '0.5rem' }}>D</th>
                                            <th style={{ padding: '0.5rem' }}>Answer</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {fileRows.slice(0, 5).map((row, i) => (
                                            <tr key={i} style={{ borderBottom: '1px solid #475569' }}>
                                                <td style={{ padding: '0.5rem' }}>{row.text.substring(0, 30)}...</td>
                                                <td style={{ padding: '0.5rem' }}>{row.options[0]}</td>
                                                <td style={{ padding: '0.5rem' }}>{row.options[1]}</td>
                                                <td style={{ padding: '0.5rem' }}>{row.options[2]}</td>
                                                <td style={{ padding: '0.5rem' }}>{row.options[3]}</td>
                                                <td style={{ padding: '0.5rem' }}>{['A','B','C','D'][row.correctOptionIndex]}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {fileRows.length > 5 && <p style={{ textAlign: 'center', color: '#9ca3af', margin: '0.5rem 0 0' }}>...and {fileRows.length - 5} more</p>}
                            </div>
                        </div>
                    )}

                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <button onClick={() => { setCreationMode('choose'); setFileRows([]); setImportErrors([]); }} style={{ ...ghostBtn, flex: 1, padding: '1rem' }}>
                            Cancel Import
                        </button>
                        <button 
                            onClick={() => handleSave(fileRows)} 
                            disabled={saving || importErrors.length > 0 || fileRows.length === 0} 
                            style={{
                                flex: 2, padding: '1rem', background: saving || importErrors.length > 0 || fileRows.length === 0 ? '#475569' : '#10b981',
                                color: 'white', border: 'none', borderRadius: '8px', cursor: saving || importErrors.length > 0 || fileRows.length === 0 ? 'not-allowed' : 'pointer', fontWeight: 'bold'
                            }}
                        >
                            {saving ? 'Saving...' : `Create Test with ${importValidCount} Questions`}
                        </button>
                    </div>
                </div>
            )}

            {creationMode === 'manual' && (
                <>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        {questions.map((q, qi) => (
                            <div key={qi} style={{ ...card, borderLeft: '4px solid #3b82f6' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                    <strong>Question {qi + 1}</strong>
                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        {qi > 0 && <button onClick={() => moveQuestion(qi, qi - 1)} style={ghostBtn}>↑</button>}
                                        {qi < questions.length - 1 && <button onClick={() => moveQuestion(qi, qi + 1)} style={ghostBtn}>↓</button>}
                                        <button onClick={() => removeQuestion(qi)} style={{ ...ghostBtn, color: '#ef4444', borderColor: '#ef4444' }}>Remove</button>
                                    </div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                                    <input type="text" placeholder="Topic" value={q.topic} onChange={e => updateQuestion(qi, 'topic', e.target.value)} style={inputStyle} />
                                    <select value={q.difficulty} onChange={e => updateQuestion(qi, 'difficulty', e.target.value)} style={inputStyle}>
                                        <option value="easy">Easy (×1.0)</option>
                                        <option value="medium">Medium (×1.2)</option>
                                        <option value="hard">Hard (×1.5)</option>
                                    </select>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                                    <label style={{ color: '#9ca3af', fontSize: '0.9rem', whiteSpace: 'nowrap' }}>Time Limit (seconds):</label>
                                    <input type="number" min="5" max="300" value={q.timeLimit} onChange={e => updateQuestion(qi, 'timeLimit', Math.max(5, parseInt(e.target.value) || 20))} style={{ ...inputStyle, width: '90px' }} />
                                </div>
                                <textarea placeholder="Question text" value={q.text} onChange={e => updateQuestion(qi, 'text', e.target.value)} style={{ ...inputStyle, minHeight: '80px', resize: 'vertical', marginBottom: '0.75rem' }} />
                                <div style={{ marginBottom: '0.75rem' }}>
                                    <p style={{ color: '#9ca3af', fontSize: '0.85rem', margin: '0 0 0.5rem' }}>Options — select the radio button next to the correct answer:</p>
                                    {q.options.map((opt, oi) => (
                                        <div key={oi} style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '0.5rem' }}>
                                            <input type="radio" name={`correct-${qi}`} checked={q.correctOptionIndex === oi} onChange={() => updateQuestion(qi, 'correctOptionIndex', oi)} style={{ width: '18px', height: '18px', cursor: 'pointer' }} aria-label={`Mark option ${oi + 1} as correct`} />
                                            <input type="text" placeholder={`Option ${oi + 1}`} value={opt} onChange={e => updateOption(qi, oi, e.target.value)} style={{ ...inputStyle, borderColor: q.correctOptionIndex === oi ? '#10b981' : '#334155' }} />
                                        </div>
                                    ))}
                                </div>
                                <textarea placeholder="Explanation (shown after question closes)" value={q.explanation} onChange={e => updateQuestion(qi, 'explanation', e.target.value)} style={{ ...inputStyle, minHeight: '60px', resize: 'vertical' }} />
                            </div>
                        ))}
                    </div>

                    <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
                        <button onClick={addQuestion} style={{ flex: 1, padding: '1rem', background: 'transparent', border: '2px dashed #475569', color: '#9ca3af', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>+ Add Question</button>
                        <button onClick={() => handleSave(questions)} disabled={saving} style={{ flex: 1, padding: '1rem', background: saving ? '#475569' : '#10b981', color: 'white', border: 'none', borderRadius: '8px', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}>
                            {saving ? 'Saving...' : `Save Test (${questions.length} questions)`}
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const card = {
    background: '#1e293b', padding: '1.5rem', borderRadius: '8px',
};
const inputStyle = {
    width: '100%', padding: '0.75rem', borderRadius: '6px',
    border: '1px solid #334155', background: '#334155', color: 'white',
    fontSize: '0.95rem', boxSizing: 'border-box',
};
const ghostBtn = {
    padding: '0.4rem 0.8rem', background: 'transparent',
    border: '1px solid #475569', color: '#9ca3af',
    borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem',
};

// ─── Analytics ────────────────────────────────────────────────────────────────

function TestAnalytics() {
    const { testId } = useParams();
    const navigate = useNavigate();
    useTeacherAuth();
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        api.getTestAnalytics(testId)
            .then(data => { setResults(data); setLoading(false); })
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
        link.setAttribute("download", `AptiQuiz_Analytics_${testId}.csv`);
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
                <Route path="/completed" element={<TestList />} />
                <Route path="/create" element={<CreateTest />} />
                <Route path="/test/:testId/host" element={<HostLobby />} />
                <Route path="/test/:testId/analytics" element={<TestAnalytics />} />
            </Routes>
        </SidebarLayout>
    );
}
