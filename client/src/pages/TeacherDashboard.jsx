import React, { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, Link } from 'react-router-dom';
import { api } from '../api';
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

// ─── Header ───────────────────────────────────────────────────────────────────

function TeacherHeader({ name }) {
    const navigate = useNavigate();
    return (
        <header style={{
            padding: '1rem 2rem', background: '#1e293b', borderBottom: '1px solid #334155',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between'
        }}>
            <Link to="/teacher" style={{ color: 'white', textDecoration: 'none', fontSize: '1.3rem', fontWeight: 'bold' }}>
                📝 AptiQuiz Teacher
            </Link>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <span style={{ color: '#9ca3af', fontSize: '0.9rem' }}>👤 {name}</span>
                <button onClick={() => logout(navigate)} style={{
                    padding: '0.4rem 0.9rem', background: 'transparent',
                    border: '1px solid #475569', color: '#9ca3af',
                    borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem'
                }}>Sign Out</button>
            </div>
        </header>
    );
}

// ─── Test List ────────────────────────────────────────────────────────────────

function TestList() {
    const navigate = useNavigate();
    useTeacherAuth();
    const [tests, setTests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        api.getTests()
            .then(data => { setTests(data); setLoading(false); })
            .catch(err => { setError(err.message); setLoading(false); });
    }, []);

    if (loading) return <div style={{ padding: '2rem', color: '#9ca3af' }}>Loading your tests...</div>;

    return (
        <div style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <h2 style={{ color: 'white', margin: 0 }}>My Tests</h2>
                <button onClick={() => navigate('/teacher/create')} style={{
                    padding: '0.75rem 1.5rem', background: '#10b981', color: 'white',
                    border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold'
                }}>+ Create New Test</button>
            </div>

            {error && <div style={{ color: '#fca5a5', marginBottom: '1rem' }}>Error: {error}</div>}

            {tests.length === 0 ? (
                <div style={{
                    padding: '3rem', background: '#1e293b', borderRadius: '12px',
                    textAlign: 'center', color: '#9ca3af'
                }}>
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
                            <button onClick={() => navigate(`/teacher/test/${test.id}/host`)} style={{
                                padding: '0.6rem 1.2rem', background: '#3b82f6', color: 'white',
                                border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold',
                                whiteSpace: 'nowrap'
                            }}>🚀 Host Room</button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ─── Create Test ──────────────────────────────────────────────────────────────

function CreateTest() {
    const navigate = useNavigate();
    useTeacherAuth();

    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [questions, setQuestions] = useState([makeBlankQuestion()]);
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

    const saveTest = async () => {
        setError(null);
        if (!title.trim()) return setError('Test title is required');
        for (let i = 0; i < questions.length; i++) {
            const q = questions[i];
            if (!q.text.trim()) return setError(`Question ${i + 1}: text is required`);
            if (q.options.some(o => !o.trim())) return setError(`Question ${i + 1}: all options must be filled`);
            const unique = new Set(q.options.map(o => o.trim().toLowerCase()));
            if (unique.size !== q.options.length) return setError(`Question ${i + 1}: duplicate options not allowed`);
        }

        setSaving(true);
        try {
            await api.createTest({ title, description, questions });
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

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {questions.map((q, qi) => (
                    <div key={qi} style={{ ...card, borderLeft: '4px solid #3b82f6' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <strong>Question {qi + 1}</strong>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                {qi > 0 && (
                                    <button onClick={() => moveQuestion(qi, qi - 1)} style={ghostBtn}>↑</button>
                                )}
                                {qi < questions.length - 1 && (
                                    <button onClick={() => moveQuestion(qi, qi + 1)} style={ghostBtn}>↓</button>
                                )}
                                <button onClick={() => removeQuestion(qi)} style={{ ...ghostBtn, color: '#ef4444', borderColor: '#ef4444' }}>
                                    Remove
                                </button>
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                            <input
                                type="text" placeholder="Topic" value={q.topic}
                                onChange={e => updateQuestion(qi, 'topic', e.target.value)}
                                style={inputStyle}
                            />
                            <select value={q.difficulty} onChange={e => updateQuestion(qi, 'difficulty', e.target.value)} style={inputStyle}>
                                <option value="easy">Easy (×1.0)</option>
                                <option value="medium">Medium (×1.2)</option>
                                <option value="hard">Hard (×1.5)</option>
                            </select>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                            <label style={{ color: '#9ca3af', fontSize: '0.9rem', whiteSpace: 'nowrap' }}>
                                Time Limit (seconds):
                            </label>
                            <input
                                type="number" min="5" max="300" value={q.timeLimit}
                                onChange={e => updateQuestion(qi, 'timeLimit', Math.max(5, parseInt(e.target.value) || 20))}
                                style={{ ...inputStyle, width: '90px' }}
                            />
                        </div>

                        <textarea
                            placeholder="Question text"
                            value={q.text} onChange={e => updateQuestion(qi, 'text', e.target.value)}
                            style={{ ...inputStyle, minHeight: '80px', resize: 'vertical', marginBottom: '0.75rem' }}
                        />

                        <div style={{ marginBottom: '0.75rem' }}>
                            <p style={{ color: '#9ca3af', fontSize: '0.85rem', margin: '0 0 0.5rem' }}>
                                Options — select the radio button next to the correct answer:
                            </p>
                            {q.options.map((opt, oi) => (
                                <div key={oi} style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '0.5rem' }}>
                                    <input
                                        type="radio" name={`correct-${qi}`}
                                        checked={q.correctOptionIndex === oi}
                                        onChange={() => updateQuestion(qi, 'correctOptionIndex', oi)}
                                        style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                                        aria-label={`Mark option ${oi + 1} as correct`}
                                    />
                                    <input
                                        type="text" placeholder={`Option ${oi + 1}`}
                                        value={opt} onChange={e => updateOption(qi, oi, e.target.value)}
                                        style={{
                                            ...inputStyle,
                                            borderColor: q.correctOptionIndex === oi ? '#10b981' : '#334155',
                                        }}
                                    />
                                </div>
                            ))}
                        </div>

                        <textarea
                            placeholder="Explanation (shown after question closes)"
                            value={q.explanation} onChange={e => updateQuestion(qi, 'explanation', e.target.value)}
                            style={{ ...inputStyle, minHeight: '60px', resize: 'vertical' }}
                        />
                    </div>
                ))}
            </div>

            <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
                <button onClick={addQuestion} style={{
                    flex: 1, padding: '1rem', background: 'transparent',
                    border: '2px dashed #475569', color: '#9ca3af',
                    borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold'
                }}>+ Add Question</button>

                <button onClick={saveTest} disabled={saving} style={{
                    flex: 1, padding: '1rem', background: saving ? '#475569' : '#10b981',
                    color: 'white', border: 'none', borderRadius: '8px',
                    cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 'bold'
                }}>
                    {saving ? 'Saving...' : `Save Test (${questions.length} questions)`}
                </button>
            </div>
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

// ─── Dashboard shell ──────────────────────────────────────────────────────────

export default function TeacherDashboard() {
    const name = localStorage.getItem('teacherName') || 'Teacher';

    return (
        <div style={{ minHeight: '100vh', background: '#0f172a' }}>
            <TeacherHeader name={name} />
            <Routes>
                <Route path="/" element={<TestList />} />
                <Route path="/create" element={<CreateTest />} />
                <Route path="/test/:testId/host" element={<HostLobby />} />
            </Routes>
        </div>
    );
}
