import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { SOCKET_URL } from '../api';

export default function SpectatorGame() {
    const { code } = useParams();
    const navigate = useNavigate();
    
    const [status, setStatus] = useState('joining');
    const [error, setError] = useState(null);
    const [roomState, setRoomState] = useState(null);
    const [question, setQuestion] = useState(null);
    const [revealData, setRevealData] = useState(null);
    const [leaderboard, setLeaderboard] = useState([]);
    const [finalResults, setFinalResults] = useState(null);
    
    const socketRef = useRef(null);
    
    useEffect(() => {
        const socket = io(SOCKET_URL, {
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionAttempts: 5,
        });
        socketRef.current = socket;
        
        socket.on('connect', () => {
            socket.emit('join_room', {
                code: code.toUpperCase(),
                displayName: 'Spectator',
                sessionTokenHash: 'spectator_' + Math.random().toString(36).substring(2, 15),
                role: 'spectator'
            }, (ack) => {
                if (ack?.success) {
                    setStatus('connected');
                } else {
                    setError(ack?.error || 'Failed to join as spectator');
                    setStatus('error');
                }
            });
        });
        
        socket.on('reconnect_state', (data) => {
            setStatus(data.state === 'LOBBY' ? 'lobby' : (data.state === 'FINISHED' ? 'finished' : (data.state === 'REVEAL' ? 'reveal' : 'question')));
            setRoomState(data);
            setLeaderboard(data.leaderboard || []);
            if (data.question) setQuestion(data.question);
        });

        socket.on('room_state', (state) => {
            setRoomState(state);
            setStatus('lobby');
        });
        
        socket.on('question_active', (qState) => {
            setQuestion(qState);
            setRevealData(null);
            setStatus('question');
        });
        
        socket.on('score_update', (lb) => {
            setLeaderboard(lb);
        });
        
        socket.on('reveal', (data) => {
            setRevealData(data);
            setLeaderboard(data.leaderboard);
            setStatus('reveal');
        });
        
        socket.on('game_finished', (results) => {
            setFinalResults(results);
            setStatus('finished');
        });
        
        socket.on('error', (err) => {
            setError(err.message);
            setStatus('error');
        });
        
        return () => socket.disconnect();
    }, [code]);

    if (status === 'error') {
        return (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'white' }}>
                <h2>Connection Error</h2>
                <p style={{ color: '#fca5a5' }}>{error}</p>
                <button onClick={() => navigate('/')} style={{ padding: '0.8rem 1.5rem', marginTop: '1rem', cursor: 'pointer' }}>Return Home</button>
            </div>
        );
    }
    
    if (status === 'joining') return <div style={{ color: 'white', padding: '2rem' }}>Joining as spectator...</div>;
    
    return (
        <div style={{ minHeight: '100vh', background: '#0f172a', color: 'white', display: 'flex', flexDirection: 'column' }}>
            <header style={{ padding: '1rem 2rem', background: '#1e293b', borderBottom: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h1 style={{ margin: 0, fontSize: '1.2rem' }}>AptiQuiz Spectator</h1>
                <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#10b981', letterSpacing: '2px' }}>ROOM: {code}</div>
            </header>
            
            <main style={{ flex: 1, padding: '2rem', display: 'flex', gap: '2rem', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
                
                {/* Main Content Area */}
                <div style={{ flex: 2 }}>
                    {status === 'lobby' && (
                        <div style={{ background: '#1e293b', padding: '3rem', borderRadius: '12px', textAlign: 'center' }}>
                            <h2 style={{ fontSize: '2rem', marginBottom: '1rem' }}>Waiting to start...</h2>
                            <p style={{ color: '#9ca3af' }}>The host will start the game shortly.</p>
                        </div>
                    )}
                    
                    {(status === 'question' || status === 'reveal') && question && (
                        <div style={{ background: '#1e293b', padding: '2rem', borderRadius: '12px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#9ca3af', marginBottom: '1rem' }}>
                                <span>Question {question.index + 1} of {question.total}</span>
                                <span>{question.topic} • {question.difficulty}</span>
                            </div>
                            <h2 style={{ fontSize: '1.5rem', marginBottom: '2rem' }}>{question.text}</h2>
                            
                            <div style={{ display: 'grid', gap: '1rem' }}>
                                {question.options.map((opt, i) => {
                                    let bg = '#334155';
                                    if (status === 'reveal') {
                                        bg = revealData?.correctOptionIndex === i ? '#10b981' : '#334155';
                                    }
                                    return (
                                        <div key={i} style={{ padding: '1rem', borderRadius: '8px', background: bg, border: '1px solid #475569' }}>
                                            {['A','B','C','D','E'][i]}. {opt}
                                        </div>
                                    );
                                })}
                            </div>
                            
                            {status === 'reveal' && revealData?.explanation && (
                                <div style={{ marginTop: '2rem', padding: '1.5rem', background: '#0f172a', borderRadius: '8px', borderLeft: '4px solid #3b82f6' }}>
                                    <h4 style={{ margin: '0 0 0.5rem 0', color: '#3b82f6' }}>Explanation</h4>
                                    <p style={{ margin: 0 }}>{revealData.explanation}</p>
                                </div>
                            )}
                        </div>
                    )}
                    
                    {status === 'finished' && finalResults && (
                        <div style={{ background: '#1e293b', padding: '3rem', borderRadius: '12px', textAlign: 'center' }}>
                            <h2 style={{ fontSize: '2.5rem', color: '#fbbf24', marginBottom: '1rem' }}>Game Finished!</h2>
                            <p style={{ color: '#9ca3af', fontSize: '1.2rem' }}>Total questions: {finalResults.totalQuestions}</p>
                        </div>
                    )}
                </div>
                
                {/* Sidebar Leaderboard */}
                <div style={{ flex: 1 }}>
                    <div style={{ background: '#1e293b', padding: '1.5rem', borderRadius: '12px', position: 'sticky', top: '2rem' }}>
                        <h3 style={{ margin: '0 0 1.5rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            🏆 Live Leaderboard
                        </h3>
                        {leaderboard.length === 0 ? <p style={{ color: '#9ca3af' }}>No players yet...</p> : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                {leaderboard.map((p, i) => (
                                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem', background: '#0f172a', borderRadius: '6px' }}>
                                        <span>
                                            <strong style={{ color: i === 0 ? '#fbbf24' : i === 1 ? '#9ca3af' : i === 2 ? '#b45309' : 'white', marginRight: '0.5rem' }}>
                                                #{i + 1}
                                            </strong>
                                            {p.displayName}
                                        </span>
                                        <span style={{ color: '#10b981', fontWeight: 'bold' }}>{p.score}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
}
