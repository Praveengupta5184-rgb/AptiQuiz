import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { SOCKET_URL } from '../api';

const LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

export default function StudentGame() {
    const { code } = useParams();
    const navigate = useNavigate();

    const socketRef = useRef(null);
    const [status, setStatus] = useState('connecting'); // connecting | lobby | question | reveal | finished | error | reconnecting
    const [errorMsg, setErrorMsg] = useState('');
    const [lobbyPlayers, setLobbyPlayers] = useState([]);
    const [question, setQuestion] = useState(null);      // { index, total, text, options[], deadlineMs, topic, difficulty }
    const [revealData, setRevealData] = useState(null);   // { correctOptionIndex, explanation, leaderboard }
    const [finalResults, setFinalResults] = useState(null);
    const [selectedOption, setSelectedOption] = useState(null);
    const [timeLeft, setTimeLeft] = useState(null);
    const [myScore, setMyScore] = useState(0);
    const [leaderboard, setLeaderboard] = useState([]);

    const token = localStorage.getItem('studentToken');
    const name = localStorage.getItem('studentName');

    // ── Timer tick ────────────────────────────────────────────────────────────

    useEffect(() => {
        if (!question || status !== 'question') return;
        const tick = () => {
            const remaining = Math.max(0, question.deadlineMs - Date.now());
            setTimeLeft(Math.ceil(remaining / 1000));
        };
        tick();
        const interval = setInterval(tick, 500);
        return () => clearInterval(interval);
    }, [question, status]);

    // ── Socket setup ──────────────────────────────────────────────────────────

    useEffect(() => {
        if (!token || !name) {
            navigate('/join');
            return;
        }

        const socket = io(SOCKET_URL, {
            reconnection: true,
            reconnectionDelay: 1500,
            reconnectionAttempts: 8,
        });
        socketRef.current = socket;

        socket.on('connect', () => {
            setStatus('connecting');
            socket.emit('join_room', {
                code,
                displayName: name,
                sessionTokenHash: token,
                role: 'player',
            }, (ack) => {
                if (!ack?.success) {
                    setStatus('error');
                    setErrorMsg(ack?.error || 'Could not join room');
                }
            });
        });

        socket.on('reconnect', () => {
            setStatus('reconnecting');
            // Re-emit join; server will detect reconnect via token
            socket.emit('join_room', {
                code,
                displayName: name,
                sessionTokenHash: token,
                role: 'player',
            });
        });

        socket.on('reconnect_failed', () => {
            setStatus('error');
            setErrorMsg('Could not reconnect to server. Please refresh the page.');
        });

        // Initial room state (lobby)
        socket.on('room_state', (state) => {
            setLobbyPlayers(state.players || []);
            setStatus('lobby');
        });

        // Reconnect state — restore current game state
        socket.on('reconnect_state', (state) => {
            setMyScore(state.score || 0);

            if (state.state === 'LOBBY') {
                setLobbyPlayers(state.players || []);
                setStatus('lobby');
                return;
            }

            if (state.state === 'QUESTION_ACTIVE' && state.question) {
                setQuestion(state.question);
                setSelectedOption(state.alreadyAnswered ? -1 : null); // -1 means answered
                setStatus('question');
                return;
            }

            if (state.state === 'REVEAL' && state.reveal) {
                setQuestion(state.question);
                setRevealData(state.reveal);
                setLeaderboard(state.reveal.leaderboard || []);
                setStatus('reveal');
                return;
            }

            if (state.state === 'FINISHED' && state.finalResults) {
                setFinalResults(state.finalResults);
                setStatus('finished');
                return;
            }

            setStatus('lobby');
        });

        // New question
        socket.on('question_active', (q) => {
            setQuestion(q);
            setRevealData(null);
            setSelectedOption(null);
            setStatus('question');
        });

        // Live leaderboard during question
        socket.on('score_update', (lb) => {
            setLeaderboard(lb);
            // Update my score from leaderboard
            const me = lb.find(p => p.displayName === name);
            if (me) setMyScore(me.score);
        });

        // Reveal
        socket.on('reveal', (data) => {
            setRevealData(data);
            setLeaderboard(data.leaderboard || []);
            setTimeLeft(0);
            setStatus('reveal');
            const me = (data.leaderboard || []).find(p => p.displayName === name);
            if (me) setMyScore(me.score);
        });

        // Finished
        socket.on('game_finished', (results) => {
            setFinalResults(results);
            setLeaderboard(results.leaderboard || []);
            setStatus('finished');
        });

        // Server errors
        socket.on('error', (err) => {
            setStatus('error');
            setErrorMsg(err.message || 'An error occurred');
        });

        // Periodic ping for RTT measurement
        const pingInterval = setInterval(() => {
            if (socket.connected) {
                const t = Date.now();
                socket.emit('ping', t);
                socket.once('pong', () => {
                    socket.emit('pong_client', t);
                });
            }
        }, 5000);

        return () => {
            clearInterval(pingInterval);
            socket.disconnect();
        };
    }, [code, token, name, navigate]);

    // ── Submit answer ─────────────────────────────────────────────────────────

    const submitAnswer = useCallback((idx) => {
        if (status !== 'question' || selectedOption !== null || !socketRef.current) return;
        setSelectedOption(idx);
        socketRef.current.emit('submit_answer', { optionIndex: idx }, (ack) => {
            if (!ack?.success) {
                // Revert selection if server rejected it
                setSelectedOption(null);
                setErrorMsg(ack?.error || 'Answer not accepted');
            }
        });
    }, [status, selectedOption]);

    // Keyboard shortcut: 1-4 to select options
    useEffect(() => {
        const handler = (e) => {
            const idx = parseInt(e.key) - 1;
            if (idx >= 0 && question && idx < question.options.length) {
                submitAnswer(idx);
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [submitAnswer, question]);

    // ── Render ────────────────────────────────────────────────────────────────

    if (status === 'connecting' || status === 'reconnecting') {
        return (
            <Screen>
                <Spinner />
                <p style={{ color: '#9ca3af' }}>
                    {status === 'reconnecting' ? '🔄 Reconnecting...' : 'Connecting...'}
                </p>
            </Screen>
        );
    }

    if (status === 'error') {
        return (
            <Screen>
                <div style={{
                    padding: '1rem', background: '#ef444420', border: '1px solid #ef4444',
                    color: '#fca5a5', borderRadius: '8px', maxWidth: '400px', textAlign: 'center'
                }}>
                    {errorMsg}
                </div>
                <button onClick={() => navigate('/join')} style={actionBtn('#3b82f6')}>
                    Try Again
                </button>
            </Screen>
        );
    }

    if (status === 'lobby') {
        return (
            <Screen>
                <div className="glass-panel text-center" style={{ maxWidth: '500px', width: '100%', padding: '2.5rem' }}>
                    <h2 style={{ fontSize: '1.5rem', color: '#cbd5e1', marginBottom: '1.5rem', fontWeight: '500' }}>Waiting for Host to start...</h2>
                    
                    <div style={{
                        fontSize: '3rem', fontWeight: '800', letterSpacing: '0.4rem',
                        color: 'var(--accent)', fontFamily: 'var(--mono)', marginBottom: '0.5rem',
                        textShadow: '0 0 20px var(--accent-bg)'
                    }}>{code}</div>
                    <p style={{ color: '#94a3b8', margin: '0 0 2rem', textTransform: 'uppercase', fontSize: '0.85rem', letterSpacing: '2px' }}>Room Code</p>
                    
                    <div className="status-badge" style={{ marginBottom: '1.5rem' }}>
                        <span style={{ color: '#10b981', marginRight: '8px' }}>●</span> Joined as <strong style={{ color: 'white', marginLeft: '4px' }}>{name}</strong>
                    </div>
                    
                    <div className="pulse-text" style={{ color: '#64748b', fontSize: '0.9rem', marginTop: '1rem' }}>
                        {lobbyPlayers.filter(p => p.displayName !== 'Host').length} student(s) ready
                    </div>
                </div>
                
                <div style={{
                    marginTop: '1rem', padding: '0.75rem 1.5rem', 
                    borderRadius: '100px', color: '#94a3b8', fontSize: '0.85rem', textAlign: 'center',
                    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)'
                }}>
                    💡 Tip: Press keys 1–4 to select answers quickly
                </div>
            </Screen>
        );
    }

    if (status === 'finished') {
        const myRank = (finalResults?.leaderboard || []).findIndex(p => p.displayName === name) + 1;
        return (
            <Screen>
                <h2>🏁 Test Complete!</h2>
                <div style={{
                    background: '#1e293b', padding: '2rem', borderRadius: '12px',
                    textAlign: 'center', maxWidth: '500px', width: '100%', marginBottom: '1.5rem'
                }}>
                    <p style={{ color: '#9ca3af', marginBottom: '0.5rem' }}>Your Score</p>
                    <div style={{ fontSize: '3rem', fontWeight: 'bold', color: '#10b981' }}>{myScore}</div>
                    {myRank > 0 && (
                        <div style={{ marginTop: '0.5rem', color: '#fbbf24' }}>
                            Rank #{myRank} of {finalResults.leaderboard.length}
                        </div>
                    )}
                </div>

                <div style={{ maxWidth: '500px', width: '100%' }}>
                    <h3 style={{ color: '#9ca3af', marginBottom: '0.75rem', textAlign: 'center' }}>Final Leaderboard</h3>
                    {(finalResults?.leaderboard || []).map((p, i) => (
                        <div key={i} style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '0.6rem 1rem', borderRadius: '4px', marginBottom: '0.4rem',
                            background: p.displayName === name ? '#1d4ed820' : '#1e293b',
                            border: p.displayName === name ? '1px solid #3b82f6' : '1px solid transparent',
                        }}>
                            <span>
                                {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`} {p.displayName}
                                {p.displayName === name && <span style={{ color: '#9ca3af', marginLeft: '0.3rem', fontSize: '0.8rem' }}>(you)</span>}
                            </span>
                            <span style={{ fontWeight: 'bold', color: '#10b981' }}>{p.score}</span>
                        </div>
                    ))}
                </div>

                <button onClick={() => navigate('/')} style={actionBtn('#3b82f6')}>
                    Back to Home
                </button>
            </Screen>
        );
    }

    if (status === 'question' || status === 'reveal') {
        const timePct = question ? Math.max(0, (timeLeft / (question.timeLimitMs / 1000)) * 100) : 0;
        const isAnswered = selectedOption !== null; 
        const answered = isAnswered || status === 'reveal';

        return (
            <div className="game-container">
                {/* Top Nav Bar */}
                <div className="game-nav glass-header">
                    <div className="nav-player">
                        <div className="nav-avatar">{name.charAt(0).toUpperCase()}</div>
                        <div className="nav-info">
                            <span className="nav-name">{name}</span>
                            <span className="nav-score">{myScore} pts</span>
                        </div>
                    </div>
                    {question && (
                        <div className="nav-progress">
                            Question {question.index + 1} <span style={{opacity: 0.5}}>/ {question.total}</span>
                        </div>
                    )}
                </div>

                {/* Animated Timer Bar */}
                {question && status === 'question' && (
                    <div className="timer-track">
                        <div className="timer-fill" style={{
                            width: `${timePct}%`,
                            background: timePct < 25 ? 'var(--danger)' : timePct < 50 ? 'var(--warning)' : 'var(--success)',
                        }} />
                    </div>
                )}

                <div className="game-content">
                    {question && (
                        <>
                            <div className="question-header">
                                <span className="topic-badge">{question.topic}</span>
                                {status === 'question' && (
                                    <span className={`time-left ${timeLeft <= 5 ? 'urgent' : ''}`}>
                                        {timeLeft}s
                                    </span>
                                )}
                            </div>

                            <h2 className="question-text">{question.text}</h2>

                            <div className="options-grid">
                                {question.options.map((opt, idx) => {
                                    let btnClass = 'option-btn';
                                    if (status === 'reveal' && revealData) {
                                        if (idx === revealData.correctOptionIndex) btnClass += ' correct';
                                        else if (selectedOption === idx) btnClass += ' wrong';
                                    } else if (selectedOption === idx) {
                                        btnClass += ' selected';
                                    }

                                    const isFaded = answered && selectedOption !== idx && (status !== 'reveal' || idx !== revealData?.correctOptionIndex);

                                    return (
                                        <button
                                            key={idx}
                                            onClick={() => submitAnswer(idx)}
                                            disabled={answered}
                                            className={`${btnClass} ${isFaded ? 'faded' : ''}`}
                                            aria-label={`Option ${LABELS[idx]}: ${opt}`}
                                        >
                                            <div className="option-label">{LABELS[idx]}</div>
                                            <div className="option-text">{opt}</div>
                                        </button>
                                    );
                                })}
                            </div>

                            {/* State Messages & Explanations */}
                            <div className="state-messages">
                                {selectedOption !== null && status === 'question' && (
                                    <div className="feedback-toast">
                                        <div className="spinner-small" />
                                        <span>Answer locked. Waiting for time...</span>
                                    </div>
                                )}

                                {status === 'reveal' && revealData && (
                                    <div className="explanation-box reveal-anim">
                                        <div className="explanation-title">
                                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                                            Explanation
                                        </div>
                                        <p>{revealData.explanation || 'No further explanation.'}</p>
                                    </div>
                                )}

                                {status === 'reveal' && leaderboard.length > 0 && (
                                    <div className="mini-lb reveal-anim" style={{ animationDelay: '0.1s' }}>
                                        <h4>Current Standings</h4>
                                        <div className="mini-lb-list">
                                            {leaderboard.slice(0, 5).map((p, i) => (
                                                <div key={i} className={`mini-lb-row ${p.displayName === name ? 'is-me' : ''}`}>
                                                    <div className="mini-lb-name">
                                                        <span className="rank-num">{i + 1}</span> {p.displayName}
                                                    </div>
                                                    <div className="mini-lb-score">{p.score}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
        );
    }

    return null;
}

// ── Helper components ────────────────────────────────────────────────────────

function Screen({ children }) {
    return (
        <div className="game-screen-bg">
            <div className="game-screen-content">
                {children}
            </div>
        </div>
    );
}

function Spinner() {
    return (
        <div style={{
            width: '40px', height: '40px', border: '4px solid #334155',
            borderTop: '4px solid #3b82f6', borderRadius: '50%',
            animation: 'spin 0.8s linear infinite'
        }} />
    );
}

function actionBtn(bg) {
    return {
        marginTop: '0.5rem', padding: '0.75rem 2rem', background: bg, color: 'white',
        border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '1rem'
    };
}
