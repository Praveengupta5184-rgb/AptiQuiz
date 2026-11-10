import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { SOCKET_URL } from '../api';

const LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

export default function BattleGame() {
    const { code } = useParams();
    const navigate = useNavigate();

    const socketRef = useRef(null);
    const [status, setStatus] = useState('connecting');
    const [errorMsg, setErrorMsg] = useState('');
    const [question, setQuestion] = useState(null);
    const [revealData, setRevealData] = useState(null);
    const [selectedOption, setSelectedOption] = useState(null);
    const [timeLeft, setTimeLeft] = useState(null);
    const [myScore, setMyScore] = useState(0);
    const [leaderboard, setLeaderboard] = useState([]);
    const [teamLeaderboard, setTeamLeaderboard] = useState([]);
    const [removedOptions, setRemovedOptions] = useState([]);
    const [myTeam, setMyTeam] = useState(null);

    const token = localStorage.getItem('studentToken');
    const name = localStorage.getItem('studentName');

    // Timer tick
    useEffect(() => {
        if (!question || status !== 'question') return;
        const tick = () => {
            const elapsedSinceReceive = Date.now() - (question.localReceivedAt || Date.now());
            const expectedServerNow = (question.serverNow || Date.now()) + elapsedSinceReceive;
            const remaining = Math.max(0, question.deadlineMs - expectedServerNow);
            setTimeLeft(Math.ceil(remaining / 1000));
        };
        tick();
        const interval = setInterval(tick, 500);
        return () => clearInterval(interval);
    }, [question, status]);

    // Socket setup
    useEffect(() => {
        if (!token || !name) {
            navigate('/student/login');
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
                studentId: parseInt(localStorage.getItem('studentId')) || undefined,
            }, (ack) => {
                if (!ack?.success) {
                    setStatus('error');
                    setErrorMsg(ack?.error || 'Could not join battle');
                }
            });
        });

        socket.on('reconnect', () => {
            setStatus('reconnecting');
            socket.emit('join_room', {
                code,
                displayName: name,
                sessionTokenHash: token,
                role: 'player',
                studentId: parseInt(localStorage.getItem('studentId')) || undefined,
            });
        });

        socket.on('reconnect_failed', () => {
            setStatus('error');
            setErrorMsg('Could not reconnect to server. Please refresh the page.');
        });

        socket.on('room_state', (state) => {
            setStatus('lobby');
        });

        socket.on('reconnect_state', (state) => {
            setMyScore(state.score || 0);
            if (state.state === 'LOBBY') {
                setStatus('lobby');
                return;
            }
            if (state.state === 'QUESTION_ACTIVE' && state.question) {
                setQuestion({ ...state.question, localReceivedAt: Date.now() });
                setSelectedOption(state.alreadyAnswered ? -1 : null);
                setRemovedOptions([]);
                setStatus('question');
                return;
            }
            if (state.state === 'REVEAL' && state.reveal) {
                setQuestion(state.question);
                setRevealData(state.reveal);
                setLeaderboard(state.reveal.leaderboard?.players || []);
                setTeamLeaderboard(state.reveal.leaderboard?.teams || []);
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

        socket.on('question_active', (q) => {
            setQuestion({ ...q, localReceivedAt: Date.now() });
            setRevealData(null);
            setSelectedOption(null);
            setRemovedOptions([]);
            setStatus('question');
        });

        socket.on('score_update', (lbData) => {
            const lb = lbData?.players || [];
            const teams = lbData?.teams || [];
            setLeaderboard(lb);
            setTeamLeaderboard(teams);
            const me = lb.find(p => p.displayName === name);
            if (me) setMyScore(me.score);
            // Update my team
            if (teams.length > 0 && me?.teamId) {
                const team = teams.find(t => t.id === me.teamId);
                if (team) setMyTeam(team);
            }
        });

        socket.on('reveal', (data) => {
            setRevealData(data);
            const lb = data.leaderboard?.players || [];
            const teams = data.leaderboard?.teams || [];
            setLeaderboard(lb);
            setTeamLeaderboard(teams);
            setTimeLeft(0);
            setStatus('reveal');
            const me = lb.find(p => p.displayName === name);
            if (me) setMyScore(me.score);
            if (teams.length > 0 && me?.teamId) {
                const team = teams.find(t => t.id === me.teamId);
                if (team) setMyTeam(team);
            }
        });

        socket.on('game_finished', (results) => {
            setFinalResults(results);
            const lb = results.leaderboard?.players || [];
            const teams = results.leaderboard?.teams || [];
            setLeaderboard(lb);
            setTeamLeaderboard(teams);
            setStatus('finished');
        });

        socket.on('battle_results', (results) => {
            // Store detailed battle results for results screen
            localStorage.setItem(`battle_results_${code}`, JSON.stringify(results));
        });

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

    const submitAnswer = useCallback((idx) => {
        if (status !== 'question' || selectedOption !== null || !socketRef.current) return;
        if (removedOptions.includes(idx)) return;
        setSelectedOption(idx);
        socketRef.current.emit('submit_answer', { optionIndex: idx }, (ack) => {
            if (!ack?.success) {
                setSelectedOption(null);
                setErrorMsg(ack?.error || 'Answer not accepted');
            }
        });
    }, [status, selectedOption, removedOptions]);

    const usePowerup = useCallback((type) => {
        if (status !== 'question' || selectedOption !== null || !socketRef.current) return;
        if (!question?.powerups?.[type] || question.powerups[type] <= 0) return;
        
        socketRef.current.emit('use_powerup', { powerupType: type }, (ack) => {
            if (ack?.success) {
                if (type === 'fifty_fifty') {
                    setRemovedOptions(ack.removedIndices || []);
                }
                setQuestion(q => {
                    if (!q) return q;
                    const newPowerups = { ...q.powerups, [type]: q.powerups[type] - 1 };
                    return {
                        ...q,
                        powerups: newPowerups,
                        activeDoublePoints: type === 'double_points' ? true : q.activeDoublePoints,
                        activeTimeFreeze: type === 'time_freeze' ? true : q.activeTimeFreeze,
                    };
                });
            } else {
                alert(ack?.error || 'Could not use powerup');
            }
        });
    }, [status, selectedOption, question]);

    // Keyboard shortcut: 1-4 to select options
    useEffect(() => {
        const handler = (e) => {
            const visualIdx = parseInt(e.key) - 1;
            const options = question?.options;
            if (options && visualIdx >= 0 && visualIdx < options.length) {
                submitAnswer(visualIdx);
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [submitAnswer, question]);

    // Render
    // Navigate to results when finished
    useEffect(() => {
        if (status === 'finished') {
            navigate(`/student/battle/${code}/results`);
        }
    }, [status, code, navigate]);

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
                <button onClick={() => navigate('/student/battle')} style={actionBtn('#3b82f6')}>
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
                    <p style={{ color: '#94a3b8', margin: '0 0 2rem', textTransform: 'uppercase', fontSize: '0.85rem', letterSpacing: '2px' }}>Battle Code</p>
                    <div className="status-badge" style={{ marginBottom: '1.5rem' }}>
                        <span style={{ color: '#10b981', marginRight: '8px' }}>●</span> Joined as <strong style={{ color: 'white', marginLeft: '4px' }}>{name}</strong>
                        {myTeam && <span style={{ marginLeft: '1rem', padding: '0.25rem 0.75rem', background: myTeam.color, borderRadius: '999px', fontSize: '0.8rem' }}>{myTeam.name}</span>}
                    </div>
                    <div className="pulse-text" style={{ color: '#64748b', fontSize: '0.9rem', marginTop: '1rem' }}>
                        Waiting for host to start the battle...
                    </div>
                </div>
            </Screen>
        );
    }

    if (status === 'finished') {
        return (
        <Screen>
            <Spinner />
            <p style={{ color: '#9ca3af', marginTop: '1rem' }}>
                Connecting to battle arena...
            </p>
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
                    {myTeam && (
                        <div className="nav-team" style={{ 
                            display: 'flex', alignItems: 'center', gap: '0.5rem',
                            padding: '0.25rem 0.75rem', background: myTeam.color, borderRadius: '999px',
                            fontSize: '0.85rem', fontWeight: 'bold', color: 'white'
                        }}>
                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'white' }} />
                            {myTeam.name}
                        </div>
                    )}
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

                            {status === 'question' && question.powerups && (
                                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                                    <button 
                                        onClick={() => usePowerup('fifty_fifty')}
                                        disabled={answered || question.powerups.fifty_fifty <= 0 || removedOptions.length > 0}
                                        style={{ ...powerupBtn, opacity: (answered || question.powerups.fifty_fifty <= 0 || removedOptions.length > 0) ? 0.5 : 1 }}
                                    >
                                        ✂️ 50/50 ({question.powerups.fifty_fifty || 0})
                                    </button>
                                    <button 
                                        onClick={() => usePowerup('double_points')}
                                        disabled={answered || question.powerups.double_points <= 0 || question.activeDoublePoints}
                                        style={{ ...powerupBtn, background: question.activeDoublePoints ? '#10b981' : undefined, opacity: (answered || question.powerups.double_points <= 0) && !question.activeDoublePoints ? 0.5 : 1 }}
                                    >
                                        🌟 2x Points ({question.powerups.double_points || 0})
                                    </button>
                                    <button 
                                        onClick={() => usePowerup('time_freeze')}
                                        disabled={answered || question.powerups.time_freeze <= 0 || question.activeTimeFreeze}
                                        style={{ ...powerupBtn, background: question.activeTimeFreeze ? '#3b82f6' : undefined, opacity: (answered || question.powerups.time_freeze <= 0) && !question.activeTimeFreeze ? 0.5 : 1 }}
                                    >
                                        ❄️ Freeze ({question.powerups.time_freeze || 0})
                                    </button>
                                </div>
                            )}

                            <div className="options-grid">
                                {(question.options || []).map((opt, idx) => {
                                    let btnClass = 'option-btn';
                                    const isRemoved = removedOptions.includes(idx);
                                    
                                    const isCorrectOption = status === 'reveal' && revealData && (
                                        idx === revealData.correctOptionIndex ||
                                        (revealData.correctOptionText && opt === revealData.correctOptionText) ||
                                        (question.mapping && question.mapping[idx] === revealData.originalCorrectOptionIndex)
                                    );

                                    if (status === 'reveal' && revealData) {
                                        if (isCorrectOption) btnClass += ' correct';
                                        else if (selectedOption === idx) btnClass += ' wrong';
                                    } else if (selectedOption === idx) {
                                        btnClass += ' selected';
                                    }

                                    const isFaded = isRemoved || (answered && selectedOption !== idx && !isCorrectOption);

                                    return (
                                        <button
                                            key={idx}
                                            onClick={() => submitAnswer(idx)}
                                            disabled={answered || isRemoved}
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

                                {/* Live Leaderboard - Team Battle Style */}
                                {status === 'reveal' && (
                                    <div className="mini-lb reveal-anim" style={{ animationDelay: '0.1s' }}>
                                        <h4>🏆 Team Standings</h4>
                                        <div className="mini-lb-list">
                                            {teamLeaderboard.map((team, i) => {
                                                const isMyTeam = team.id === myTeam?.id;
                                                return (
                                                    <div key={team.id} className={`mini-lb-row ${isMyTeam ? 'is-my-team' : ''}`} style={{ borderLeft: `4px solid ${team.color || '#3b82f6'}` }}>
                                                        <div className="mini-lb-name" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                            <span className="rank-num" style={{ background: team.color || '#3b82f6' }}>{i + 1}</span> 
                                                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: team.color || '#3b82f6' }} />
                                                                {team.name}
                                                            </span>
                                                        </div>
                                                        <div className="mini-lb-score" style={{ color: team.color || '#fbbf24', fontWeight: 'bold' }}>{team.score} pts</div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {status === 'reveal' && leaderboard.length > 0 && (
                                    <div className="mini-lb reveal-anim" style={{ animationDelay: '0.2s' }}>
                                        <h4>👤 Individual Standings</h4>
                                        <div className="mini-lb-list">
                                            {leaderboard.slice(0, 5).map((p, i) => (
                                                <div key={i} className={`mini-lb-row ${p.displayName === name ? 'is-me' : ''}`}>
                                                    <div className="mini-lb-name">
                                                        <span className="rank-num">{i + 1}</span> {p.displayName}
                                                        {p.teamName && <span style={{ marginLeft: '0.5rem', padding: '0.1rem 0.4rem', background: '#334155', borderRadius: '4px', fontSize: '0.7rem' }}>{p.teamName}</span>}
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

    return (
        <Screen>
            <Spinner />
            <p style={{ color: '#9ca3af', marginTop: '1rem' }}>
                Connecting to battle arena...
            </p>
        </Screen>
    );
}

// Helper components
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

const powerupBtn = {
    padding: '0.5rem 1rem', background: '#334155', color: 'white', border: '1px solid #475569', 
    borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.9rem',
    display: 'flex', alignItems: 'center', gap: '0.5rem', transition: 'all 0.2s'
};