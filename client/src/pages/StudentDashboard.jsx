import React, { useEffect, useState } from 'react';
import { Routes, Route, useNavigate, Link } from 'react-router-dom';
import { api } from '../api';

function SidebarLayout({ name, navigate, children }) {
    const location = window.location.pathname;
    const navItems = [
        { path: '/student', label: 'Overview', icon: '🏠' },
        { path: '/student/join', label: 'Join Test', icon: '▶️' },
        { path: '/student/results', label: 'My Results', icon: '🏆' },
        { path: '/student/daily', label: 'Daily Challenge', icon: '📅' },
        { path: '/student/leagues', label: 'College Leagues', icon: '🏛️' }
    ];

    const handleLogout = () => {
        localStorage.removeItem('studentToken');
        localStorage.removeItem('studentName');
        localStorage.removeItem('studentId');
        navigate('/');
    };

    return (
        <div style={{ display: 'flex', minHeight: '100vh', background: '#0f172a', color: 'white' }}>
            {/* Sidebar */}
            <aside style={{ width: '250px', background: '#1e293b', borderRight: '1px solid #334155', display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '1.5rem', borderBottom: '1px solid #334155' }}>
                    <Link to="/student" style={{ color: 'white', textDecoration: 'none', fontSize: '1.3rem', fontWeight: 'bold' }}>
                        🎓 AptiQuiz Student
                    </Link>
                </div>
                <nav style={{ flex: 1, padding: '1rem 0' }}>
                    {navItems.map(item => {
                        const isActive = location === item.path || (item.path !== '/student' && location.startsWith(item.path));
                        return (
                            <Link key={item.path} to={item.path} style={{
                                display: 'block', padding: '1rem 1.5rem', color: isActive ? '#3b82f6' : '#9ca3af',
                                textDecoration: 'none', background: isActive ? '#0f172a' : 'transparent',
                                borderLeft: `4px solid ${isActive ? '#3b82f6' : 'transparent'}`,
                                fontWeight: isActive ? 'bold' : 'normal',
                                transition: 'all 0.2s'
                            }}>
                                <span style={{ marginRight: '0.75rem' }}>{item.icon}</span> {item.label}
                            </Link>
                        );
                    })}
                </nav>
            </aside>
            
            {/* Main Content */}
            <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <header style={{ padding: '1rem 2rem', background: '#1e293b', borderBottom: '1px solid #334155', display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <span style={{ color: '#9ca3af', fontSize: '0.9rem' }}>👤 {name}</span>
                        <button onClick={handleLogout} style={{
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

function StudentViews() {
    const navigate = useNavigate();
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const location = window.location.pathname;
    const isOverview = location === '/student' || location === '/student/dashboard';
    const isJoin = location === '/student/join';
    const isResults = location === '/student/results';

    useEffect(() => {
        api.getStudentResults()
            .then(data => { setResults(data); setLoading(false); })
            .catch(err => { setError(err.message); setLoading(false); });
    }, []);

    const [joinCode, setJoinCode] = useState('');
    const [joinError, setJoinError] = useState(null);

    const handleJoin = (e) => {
        e.preventDefault();
        setJoinError(null);
        if (!joinCode.trim()) return;
        
        // Since we don't have a specific backend endpoint for validation easily written yet,
        // we'll rely on the socket room connection to validate it. 
        // We navigate to /room/:code which handles it.
        navigate(`/room/${joinCode.trim().toUpperCase()}`);
    };

    if (loading) return <div style={{ color: '#9ca3af' }}>Loading your dashboard...</div>;
    if (error) return <div style={{ color: '#fca5a5' }}>Error: {error}</div>;

    const renderOverview = () => {
        const avgAccuracy = results.length > 0 ? (results.reduce((acc, r) => acc + Number(r.accuracy_percent || 0), 0) / results.length).toFixed(1) : 0;
        
        return (
            <div>
                <h2 style={{ color: 'white', margin: '0 0 2rem 0' }}>Overview</h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
                    <div style={{ padding: '1.5rem', background: '#1e293b', borderRadius: '8px', borderLeft: '4px solid #3b82f6' }}>
                        <h3 style={{ margin: '0 0 0.5rem', color: '#9ca3af', fontSize: '0.9rem' }}>TESTS TAKEN</h3>
                        <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'white' }}>{results.length}</div>
                    </div>
                    <div style={{ padding: '1.5rem', background: '#1e293b', borderRadius: '8px', borderLeft: '4px solid #10b981' }}>
                        <h3 style={{ margin: '0 0 0.5rem', color: '#9ca3af', fontSize: '0.9rem' }}>AVG ACCURACY</h3>
                        <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'white' }}>{avgAccuracy}%</div>
                    </div>
                </div>
                
                <div style={{ background: '#1e293b', padding: '2rem', borderRadius: '12px', textAlign: 'center' }}>
                    <h3 style={{ color: 'white', marginBottom: '1rem' }}>Ready for a new test?</h3>
                    <button onClick={() => navigate('/student/join')} style={{
                        padding: '0.75rem 1.5rem', background: '#10b981', color: 'white', border: 'none', borderRadius: '6px', fontSize: '1.1rem', cursor: 'pointer', fontWeight: 'bold'
                    }}>Join Room</button>
                </div>
            </div>
        );
    };

    const renderJoin = () => (
        <div style={{ maxWidth: '400px', margin: '2rem auto' }}>
            <h2 style={{ color: 'white', margin: '0 0 2rem 0', textAlign: 'center' }}>Join Test</h2>
            <form onSubmit={handleJoin} style={{ background: '#1e293b', padding: '2rem', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <div>
                    <label style={{ color: '#9ca3af', display: 'block', marginBottom: '0.5rem' }}>Room Code</label>
                    <input type="text" maxLength={5} value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())} required placeholder="ENTER CODE" style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: 'none', background: '#334155', color: 'white', fontSize: '1.5rem', textAlign: 'center', letterSpacing: '4px', textTransform: 'uppercase' }} />
                </div>
                {joinError && <div style={{ color: '#fca5a5', fontSize: '0.9rem', textAlign: 'center' }}>{joinError}</div>}
                <button type="submit" style={{ padding: '1rem', background: '#10b981', color: 'white', border: 'none', borderRadius: '6px', fontSize: '1.2rem', fontWeight: 'bold', cursor: 'pointer' }}>Join Lobby</button>
            </form>
        </div>
    );

    const renderResults = () => (
        <div>
            <h2 style={{ color: 'white', margin: '0 0 2rem 0' }}>My Results</h2>
            {results.length === 0 ? (
                <div style={{ background: '#1e293b', padding: '3rem', borderRadius: '8px', textAlign: 'center' }}>
                    <p style={{ color: '#9ca3af', fontSize: '1.1rem', marginBottom: '1rem' }}>You haven't taken any tests yet.</p>
                </div>
            ) : (
                <div style={{ display: 'grid', gap: '1rem' }}>
                    {results.map((r, idx) => (
                        <div key={r.id || idx} onClick={() => navigate(`/student/results/${r.id}`)} style={{ cursor: 'pointer',
                            background: '#1e293b', padding: '1.5rem', borderRadius: '8px',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            borderLeft: `4px solid ${r.rank === 1 ? '#fbbf24' : r.rank === 2 ? '#94a3b8' : r.rank === 3 ? '#c2775b' : '#3b82f6'}`
                        }}>
                            <div>
                                <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.1rem' }}>{r.test_title}</h3>
                                <p style={{ margin: 0, color: '#9ca3af', fontSize: '0.85rem' }}>
                                    {new Date(r.created_at).toLocaleString()}
                                </p>
                            </div>
                            <div style={{ display: 'flex', gap: '2rem', textAlign: 'center', flexWrap: 'wrap' }}>
                                <div>
                                    <div style={{ fontSize: '0.8rem', color: '#9ca3af', textTransform: 'uppercase' }}>Rank</div>
                                    <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: r.rank <= 3 ? '#fbbf24' : 'white' }}>
                                        #{r.rank} / {r.total_participants}
                                    </div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.8rem', color: '#9ca3af', textTransform: 'uppercase' }}>Score</div>
                                    <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#10b981' }}>
                                        {r.total_score}
                                    </div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.8rem', color: '#9ca3af', textTransform: 'uppercase' }}>Accuracy</div>
                                    <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>
                                        {Number(r.accuracy_percent)}%
                                    </div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.8rem', color: '#9ca3af', textTransform: 'uppercase' }}>Stats</div>
                                    <div style={{ fontSize: '1.1rem', color: '#cbd5e1' }}>
                                        ✅ {r.correct} ❌ {r.attempted - r.correct} ➖ {r.total_questions - r.attempted}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );

    return (
        <div>
            {isOverview && renderOverview()}
            {isJoin && renderJoin()}
            {isResults && renderResults()}
        </div>
    );
}

function StudentResultDetails() {
    const { id } = window.location.pathname.match(/\/student\/results\/(.+)/)?.groups || { id: window.location.pathname.split('/').pop() };
    const navigate = useNavigate();
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        api.getStudentResultDetails(id)
            .then(data => { setResult(data); setLoading(false); })
            .catch(err => { setError(err.message); setLoading(false); });
    }, [id]);

    if (loading) return <div style={{ color: '#9ca3af' }}>Loading result...</div>;
    if (error) return <div style={{ color: '#fca5a5' }}>Error: {error}</div>;
    if (!result) return <div style={{ color: '#9ca3af' }}>Result not found</div>;

    const { test_title, test_description, created_at, total_score, rank, accuracy_percent, attempted, correct, avg_response_time_ms, total_questions, stats, leaderboard, room_code } = result;
    const myName = localStorage.getItem('studentName');

    return (
        <div>
            <button onClick={() => navigate('/student/results')} style={{
                background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: 0, marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem'
            }}>
                ← Back to Results
            </button>
            <div style={{ background: '#1e293b', padding: '2rem', borderRadius: '12px' }}>
                <h2 style={{ color: 'white', margin: '0 0 0.5rem 0' }}>{test_title}</h2>
                <p style={{ color: '#9ca3af', margin: '0 0 2rem 0' }}>Completed on {new Date(created_at).toLocaleString()}</p>
                
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
                    <div>
                        <div style={{ fontSize: '0.9rem', color: '#9ca3af', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Rank</div>
                        <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: rank === 1 ? '#fbbf24' : rank === 2 ? '#94a3b8' : rank === 3 ? '#c2775b' : 'white' }}>
                            #{rank}
                        </div>
                    </div>
                    <div>
                        <div style={{ fontSize: '0.9rem', color: '#9ca3af', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Score</div>
                        <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#10b981' }}>{total_score}</div>
                    </div>
                    <div>
                        <div style={{ fontSize: '0.9rem', color: '#9ca3af', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Accuracy</div>
                        <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: 'white' }}>{Number(accuracy_percent)}%</div>
                    </div>
                </div>

                <div style={{ borderTop: '1px solid #334155', paddingTop: '2rem' }}>
                    <h3 style={{ color: 'white', margin: '0 0 1rem 0' }}>Performance Details</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', color: '#cbd5e1' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem', background: '#0f172a', borderRadius: '8px' }}>
                            <span>Total Questions:</span> <strong>{total_questions}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem', background: '#0f172a', borderRadius: '8px' }}>
                            <span>Attempted:</span> <strong>{attempted}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem', background: '#0f172a', borderRadius: '8px' }}>
                            <span>Correct Answers:</span> <strong style={{ color: '#10b981' }}>{correct}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem', background: '#0f172a', borderRadius: '8px' }}>
                            <span>Incorrect/Unanswered:</span> <strong style={{ color: '#ef4444' }}>{total_questions - correct}</strong>
                        </div>
                        {avg_response_time_ms > 0 && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem', background: '#0f172a', borderRadius: '8px', gridColumn: '1 / -1' }}>
                                <span>Avg Response Time:</span> <strong>{(avg_response_time_ms / 1000).toFixed(2)}s per question</strong>
                            </div>
                        )}
                    </div>
                </div>

                {stats && (
                    <div style={{ borderTop: '1px solid #334155', paddingTop: '2rem', marginTop: '2rem' }}>
                        <h3 style={{ color: 'white', margin: '0 0 1rem 0' }}>Class Comparison</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                            <div style={{ background: '#0f172a', padding: '1.5rem', borderRadius: '8px' }}>
                                <div style={{ color: '#9ca3af', fontSize: '0.9rem', textTransform: 'uppercase' }}>Highest Score</div>
                                <div style={{ color: '#fbbf24', fontSize: '1.8rem', fontWeight: 'bold' }}>{stats.highestScore}</div>
                            </div>
                            <div style={{ background: '#0f172a', padding: '1.5rem', borderRadius: '8px' }}>
                                <div style={{ color: '#9ca3af', fontSize: '0.9rem', textTransform: 'uppercase' }}>Class Average</div>
                                <div style={{ color: '#3b82f6', fontSize: '1.8rem', fontWeight: 'bold' }}>{stats.avgScore}</div>
                            </div>
                            <div style={{ background: '#0f172a', padding: '1.5rem', borderRadius: '8px' }}>
                                <div style={{ color: '#9ca3af', fontSize: '0.9rem', textTransform: 'uppercase' }}>Difference from Avg</div>
                                <div style={{ color: stats.diffFromAvg > 0 ? '#10b981' : (stats.diffFromAvg < 0 ? '#ef4444' : 'white'), fontSize: '1.8rem', fontWeight: 'bold' }}>
                                    {stats.diffFromAvg > 0 ? '+' : ''}{stats.diffFromAvg}
                                </div>
                            </div>
                            <div style={{ background: '#0f172a', padding: '1.5rem', borderRadius: '8px' }}>
                                <div style={{ color: '#9ca3af', fontSize: '0.9rem', textTransform: 'uppercase' }}>Total Participants</div>
                                <div style={{ color: 'white', fontSize: '1.8rem', fontWeight: 'bold' }}>{stats.totalParticipants}</div>
                            </div>
                        </div>
                    </div>
                )}
                
                {leaderboard && leaderboard.length > 0 && (
                    <div style={{ borderTop: '1px solid #334155', paddingTop: '2rem', marginTop: '2rem' }}>
                        <h3 style={{ color: 'white', margin: '0 0 1rem 0' }}>Room Leaderboard (Room: {room_code})</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {leaderboard.map((p, i) => (
                                <div key={i} style={{
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                    padding: '1rem', background: p.display_name === myName ? '#1e293b' : '#0f172a',
                                    border: p.display_name === myName ? '1px solid #3b82f6' : '1px solid transparent',
                                    borderRadius: '8px'
                                }}>
                                    <div>
                                        <strong style={{ color: i === 0 ? '#fbbf24' : i === 1 ? '#94a3b8' : i === 2 ? '#c2775b' : 'white', marginRight: '1rem', fontSize: '1.1rem' }}>
                                            #{p.rank}
                                        </strong>
                                        <span style={{ fontSize: '1.1rem', color: p.display_name === myName ? '#3b82f6' : 'white', fontWeight: p.display_name === myName ? 'bold' : 'normal' }}>
                                            {p.display_name} {p.display_name === myName ? '(You)' : ''}
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', gap: '2rem', textAlign: 'right' }}>
                                        <div>
                                            <span style={{ color: '#9ca3af', fontSize: '0.8rem', marginRight: '0.5rem' }}>SCORE</span>
                                            <strong style={{ color: '#10b981', fontSize: '1.1rem' }}>{p.total_score}</strong>
                                        </div>
                                        <div>
                                            <span style={{ color: '#9ca3af', fontSize: '0.8rem', marginRight: '0.5rem' }}>ACCURACY</span>
                                            <strong style={{ color: 'white', fontSize: '1.1rem' }}>{Number(p.accuracy_percent)}%</strong>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function StudentDaily() {
    const [challenge, setChallenge] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [answers, setAnswers] = useState({});
    const [submitted, setSubmitted] = useState(false);
    const [result, setResult] = useState(null);
    const [leaderboard, setLeaderboard] = useState([]);
    
    useEffect(() => {
        api.getDailyChallenge()
            .then(data => { setChallenge(data); setLoading(false); })
            .catch(err => { setError(err.message); setLoading(false); });
    }, []);

    const fetchLeaderboard = (date) => {
        api.getDailyLeaderboard(date).then(data => setLeaderboard(data.leaderboard || [])).catch(() => {});
    };

    const handleSubmit = async () => {
        try {
            const playerIdentifier = localStorage.getItem('studentName') || 'Unknown';
            const res = await api.submitDailyChallenge({ challengeId: challenge.id, playerIdentifier, answers });
            setResult(res);
            setSubmitted(true);
            fetchLeaderboard(challenge.date);
        } catch (e) {
            alert('Failed to submit: ' + e.message);
        }
    };

    if (loading) return <div style={{ color: '#9ca3af' }}>Loading daily challenge...</div>;
    if (error) return <div style={{ color: '#fca5a5' }}>Error: {error}</div>;
    if (!challenge) return null;

    return (
        <div>
            <h2 style={{ color: 'white', margin: '0 0 0.5rem 0' }}>Daily Challenge</h2>
            <p style={{ color: '#9ca3af', marginBottom: '2rem' }}>Date: {challenge.date}</p>
            
            {submitted && result ? (
                <div style={{ background: '#1e293b', padding: '2rem', borderRadius: '12px', marginBottom: '2rem' }}>
                    <h3 style={{ color: 'white', marginTop: 0 }}>You scored {result.score} points!</h3>
                    <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {challenge.questions.map((q, idx) => {
                            const res = result.results[q.id];
                            return (
                                <div key={q.id} style={{ background: '#0f172a', padding: '1rem', borderRadius: '8px', borderLeft: `4px solid ${res.correct ? '#10b981' : '#ef4444'}` }}>
                                    <strong>Q{idx+1}: {q.text}</strong>
                                    <div style={{ marginTop: '0.5rem', color: res.correct ? '#10b981' : '#ef4444' }}>
                                        {res.correct ? '✅ Correct' : `❌ Incorrect (Correct was option ${['A','B','C','D','E'][res.correctIndex]})`}
                                    </div>
                                    {res.explanation && <div style={{ marginTop: '0.5rem', color: '#9ca3af', fontSize: '0.9rem' }}>{res.explanation}</div>}
                                </div>
                            );
                        })}
                    </div>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                    {challenge.questions.map((q, idx) => (
                        <div key={q.id} style={{ background: '#1e293b', padding: '1.5rem', borderRadius: '8px' }}>
                            <h3 style={{ margin: '0 0 1rem 0', color: 'white', fontSize: '1.1rem' }}>{idx+1}. {q.text}</h3>
                            <div style={{ display: 'grid', gap: '0.5rem' }}>
                                {q.options.map((opt, oIdx) => (
                                    <label key={oIdx} style={{
                                        display: 'flex', alignItems: 'center', padding: '0.75rem 1rem', background: answers[q.id] === oIdx ? '#3b82f640' : '#334155',
                                        borderRadius: '6px', cursor: 'pointer', border: `1px solid ${answers[q.id] === oIdx ? '#3b82f6' : 'transparent'}`
                                    }}>
                                        <input type="radio" name={`q_${q.id}`} value={oIdx} checked={answers[q.id] === oIdx} onChange={() => setAnswers({...answers, [q.id]: oIdx})} style={{ marginRight: '1rem' }} />
                                        <span>{opt}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    ))}
                    <button onClick={handleSubmit} disabled={Object.keys(answers).length < challenge.questions.length} style={{
                        padding: '1rem', background: '#10b981', color: 'white', border: 'none', borderRadius: '6px', fontSize: '1.2rem', fontWeight: 'bold', cursor: Object.keys(answers).length < challenge.questions.length ? 'not-allowed' : 'pointer', opacity: Object.keys(answers).length < challenge.questions.length ? 0.5 : 1
                    }}>
                        Submit Challenge
                    </button>
                </div>
            )}
            
            {submitted && (
                <div style={{ marginTop: '3rem' }}>
                    <h3 style={{ color: 'white' }}>Today's Leaderboard</h3>
                    <div style={{ background: '#1e293b', borderRadius: '8px', padding: '1rem' }}>
                        {leaderboard.length === 0 ? <div style={{ color: '#9ca3af' }}>No attempts yet...</div> : leaderboard.map((l, i) => (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem', borderBottom: '1px solid #334155' }}>
                                <span>{i+1}. {l.player_identifier}</span>
                                <strong style={{ color: '#10b981' }}>{l.score} pts</strong>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

function StudentLeagues() {
    const [leagues, setLeagues] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.getLeagues()
            .then(data => { setLeagues(data.leagues || []); setLoading(false); })
            .catch(() => setLoading(false));
    }, []);

    if (loading) return <div style={{ color: '#9ca3af' }}>Loading leagues...</div>;

    return (
        <div>
            <h2 style={{ color: 'white', margin: '0 0 2rem 0' }}>College Leagues</h2>
            <div style={{ background: '#1e293b', borderRadius: '8px', padding: '1rem' }}>
                {leagues.length === 0 ? <p style={{ color: '#9ca3af' }}>No college league scores yet.</p> : leagues.map((l, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem', borderBottom: '1px solid #334155' }}>
                        <span style={{ fontSize: '1.2rem' }}>{i+1}. <strong>{l.college_name}</strong></span>
                        <strong style={{ fontSize: '1.2rem', color: '#fbbf24' }}>{l.score} pts</strong>
                    </div>
                ))}
            </div>
        </div>
    );
}

export default function StudentDashboard() {
    const navigate = useNavigate();
    const name = localStorage.getItem('studentName') || 'Student';

    useEffect(() => {
        const token = localStorage.getItem('studentToken');
        if (!token) {
            navigate('/student/login');
        }
    }, [navigate]);

    return (
        <SidebarLayout name={name} navigate={navigate}>
            <Routes>
                <Route path="/" element={<StudentViews />} />
                <Route path="/dashboard" element={<StudentViews />} />
                <Route path="/join" element={<StudentViews />} />
                <Route path="/results" element={<StudentViews />} />
                <Route path="/results/:id" element={<StudentResultDetails />} />
                <Route path="/daily" element={<StudentDaily />} />
                <Route path="/leagues" element={<StudentLeagues />} />
            </Routes>
        </SidebarLayout>
    );
}
