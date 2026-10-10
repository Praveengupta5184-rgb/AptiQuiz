import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { api, SOCKET_URL } from '../api';

export default function HostLobby() {
    const { testId } = useParams();
    const navigate = useNavigate();

    const socketRef = useRef(null);
    const [room, setRoom] = useState(null);       // { code, hostSocketToken }
    const [roomState, setRoomState] = useState(null);
    const [error, setError] = useState(null);
    const [starting, setStarting] = useState(false);

    // Create the room once on mount
    useEffect(() => {
        let cancelled = false;

        api.createRoom({ questionSetId: testId, settings: { maxPlayers: 50, advanceEarly: true } })
            .then(data => {
                if (cancelled) return;
                if (!data.success) throw new Error(data.error || 'Failed to create room');
                setRoom(data);

                // Connect to socket as host
                const socket = io(SOCKET_URL, {
                    reconnection: true,
                    reconnectionDelay: 1000,
                    reconnectionAttempts: 5,
                });
                socketRef.current = socket;

                socket.on('connect', () => {
                    socket.emit('join_room', {
                        code: data.code,
                        displayName: 'Host',
                        sessionTokenHash: data.hostSocketToken,
                        role: 'host',
                    }, (ack) => {
                        if (!ack?.success) setError(ack?.error || 'Failed to join room as host');
                    });
                });

                socket.on('room_state', (state) => {
                    if (!cancelled) setRoomState(state);
                });

                socket.on('question_active', () => {
                    if (!cancelled) setRoomState(prev => ({ ...prev, state: 'QUESTION_ACTIVE' }));
                });

                socket.on('score_update', (leaderboard) => {
                    if (!cancelled) setRoomState(prev => ({ ...prev, leaderboard }));
                });

                socket.on('reveal', (revealData) => {
                    if (!cancelled) setRoomState(prev => ({
                        ...prev,
                        state: 'REVEAL',
                        leaderboard: revealData.leaderboard,
                    }));
                });

                socket.on('game_finished', (results) => {
                    if (!cancelled) setRoomState(prev => ({
                        ...prev,
                        state: 'FINISHED',
                        leaderboard: results.leaderboard,
                    }));
                });

                socket.on('connect_error', (err) => {
                    if (!cancelled) setError(`Connection error: ${err.message}`);
                });

                socket.on('error', (err) => {
                    if (!cancelled) setError(err.message);
                });
            })
            .catch(err => {
                if (!cancelled) setError(err.message);
            });

        return () => {
            cancelled = true;
            if (socketRef.current) socketRef.current.disconnect();
        };
    }, [testId]);

    const startGame = () => {
        if (!socketRef.current || starting) return;
        setStarting(true);
        socketRef.current.emit('start_game', {}, (ack) => {
            setStarting(false);
            if (!ack?.success) setError(ack?.error || 'Failed to start game');
        });
    };

    // ── Error state ──
    if (error) {
        return (
            <div style={{ padding: '2rem', color: 'white', textAlign: 'center' }}>
                <div style={{
                    padding: '1rem', background: '#ef444420', border: '1px solid #ef4444',
                    color: '#fca5a5', borderRadius: '8px', maxWidth: '500px', margin: '0 auto'
                }}>
                    <strong>Error:</strong> {error}
                </div>
                <button onClick={() => navigate('/teacher')} style={btnStyle('#3b82f6')}>
                    ← Back to Dashboard
                </button>
            </div>
        );
    }

    // ── Loading state ──
    if (!room || !roomState) {
        return (
            <div style={{ padding: '2rem', color: 'white', textAlign: 'center' }}>
                <p>Creating room...</p>
            </div>
        );
    }

    // ── Finished state ──
    if (roomState.state === 'FINISHED') {
        const exportToCSV = () => {
            if (!roomState.leaderboard) return;
            const headers = ['Rank', 'Name', 'Score'];
            const rows = roomState.leaderboard.map((p, i) => [i + 1, p.displayName, p.score]);
            const csvContent = "data:text/csv;charset=utf-8," + [headers, ...rows].map(e => e.join(",")).join("\n");
            const encodedUri = encodeURI(csvContent);
            const link = document.createElement("a");
            link.setAttribute("href", encodedUri);
            link.setAttribute("download", `AptiQuiz_Results_${room.code}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        };

        return (
            <div style={{ padding: '2rem', color: 'white', textAlign: 'center' }}>
                <h2>🎉 Test Complete!</h2>
                <div style={{ maxWidth: '600px', margin: '2rem auto' }}>
                    <h3 style={{ marginBottom: '1rem', color: '#9ca3af' }}>Final Leaderboard</h3>
                    {roomState.leaderboard?.map((p, i) => (
                        <div key={i} style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '0.75rem 1rem', background: i === 0 ? '#1d4ed820' : '#1e293b',
                            borderRadius: '6px', marginBottom: '0.5rem',
                            borderLeft: `4px solid ${i === 0 ? '#fbbf24' : i === 1 ? '#94a3b8' : i === 2 ? '#c2775b' : '#334155'}`
                        }}>
                            <span>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`} {p.displayName}</span>
                            <span style={{ fontWeight: 'bold', color: '#10b981' }}>{p.score} pts</span>
                        </div>
                    ))}
                </div>
                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                    <button onClick={exportToCSV} style={{...btnStyle('#10b981'), display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
                        📊 Download CSV
                    </button>
                    <button onClick={() => navigate('/teacher')} style={btnStyle('#3b82f6')}>
                        ← Back to Dashboard
                    </button>
                </div>
            </div>
        );
    }

    // ── Active game state ──
    if (roomState.state === 'QUESTION_ACTIVE' || roomState.state === 'REVEAL') {
        return (
            <div style={{ padding: '2rem', color: 'white' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                    <h2 style={{ margin: 0 }}>
                        🔴 LIVE — Room {room.code}
                        <span style={{
                            marginLeft: '1rem', fontSize: '0.9rem', padding: '0.25rem 0.6rem',
                            background: roomState.state === 'QUESTION_ACTIVE' ? '#10b981' : '#f59e0b',
                            borderRadius: '1rem', fontWeight: 'normal'
                        }}>
                            {roomState.state === 'QUESTION_ACTIVE' ? 'Answering' : 'Revealing'}
                        </span>
                    </h2>
                    <span style={{ color: '#9ca3af', fontSize: '0.9rem' }}>
                        {roomState.players?.filter(p => p.connected).length || 0} connected
                    </span>
                </div>

                <div style={{ maxWidth: '600px', margin: '0 auto' }}>
                    <h3 style={{ color: '#9ca3af', marginBottom: '0.75rem' }}>Live Standings</h3>
                    {!roomState.leaderboard || roomState.leaderboard.length === 0 ? (
                        <p style={{ color: '#475569' }}>No scores yet...</p>
                    ) : (
                        roomState.leaderboard.map((p, i) => (
                            <div key={i} style={{
                                display: 'flex', justifyContent: 'space-between',
                                padding: '0.6rem 1rem', background: '#1e293b',
                                borderRadius: '4px', marginBottom: '0.4rem',
                            }}>
                                <span>{i + 1}. {p.displayName}</span>
                                <span style={{ color: '#10b981', fontWeight: 'bold' }}>{p.score} pts</span>
                            </div>
                        ))
                    )}
                </div>
            </div>
        );
    }

    // ── Lobby state ──
    const playerCount = roomState.players?.filter(p => p.displayName !== 'Host').length || 0;
    const joinUrl = `${window.location.origin}/join`;

    return (
        <div style={{ padding: '2rem', color: 'white', maxWidth: '800px', margin: '0 auto' }}>
            <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
                <h2 style={{ color: '#9ca3af', marginBottom: '0.5rem' }}>Room Code</h2>
                <div style={{
                    fontSize: '4rem', fontWeight: 'bold', letterSpacing: '0.5rem',
                    color: '#10b981', fontFamily: 'monospace',
                    background: '#1e293b', padding: '1rem 2rem', borderRadius: '12px',
                    display: 'inline-block'
                }}>
                    {room.code}
                </div>
                <p style={{ color: '#9ca3af', marginTop: '0.75rem' }}>
                    Students go to <strong style={{ color: 'white' }}>{joinUrl}</strong> and enter this code
                </p>
                <button onClick={() => navigator.clipboard?.writeText(room.code)}
                    style={{ ...ghostBtn, marginTop: '0.5rem' }}>
                    📋 Copy Code
                </button>
            </div>

            <div style={{ background: '#1e293b', borderRadius: '12px', padding: '1.5rem', marginBottom: '2rem' }}>
                <h3 style={{ margin: '0 0 1rem', display: 'flex', justifyContent: 'space-between' }}>
                    <span>Students Joined</span>
                    <span style={{ color: '#9ca3af', fontWeight: 'normal' }}>{playerCount} / 50</span>
                </h3>

                {playerCount === 0 ? (
                    <p style={{ color: '#475569', textAlign: 'center', padding: '1rem' }}>
                        Waiting for students to join...
                    </p>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.5rem' }}>
                        {roomState.players
                            .filter(p => p.displayName !== 'Host')
                            .map((p, i) => (
                                <div key={i} style={{
                                    padding: '0.5rem 0.75rem', background: '#334155',
                                    borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '0.4rem',
                                    fontSize: '0.9rem'
                                }}>
                                    <span>{p.connected ? '🟢' : '🔴'}</span>
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {p.displayName}
                                    </span>
                                </div>
                            ))}
                    </div>
                )}
            </div>

            <div style={{ textAlign: 'center' }}>
                <button
                    onClick={startGame}
                    disabled={playerCount === 0 || starting}
                    style={{
                        padding: '1rem 3rem', fontSize: '1.2rem', fontWeight: 'bold',
                        background: playerCount === 0 || starting ? '#475569' : '#3b82f6',
                        color: 'white', border: 'none', borderRadius: '8px',
                        cursor: playerCount === 0 || starting ? 'not-allowed' : 'pointer',
                    }}
                >
                    {starting ? 'Starting...' : playerCount === 0 ? 'Waiting for students...' : `🚀 Start Test (${playerCount} student${playerCount !== 1 ? 's' : ''})`}
                </button>
                <p style={{ color: '#475569', fontSize: '0.8rem', marginTop: '0.5rem' }}>
                    Only you (the host) can start the test.
                </p>
            </div>
        </div>
    );
}

function btnStyle(bg) {
    return {
        display: 'inline-block', marginTop: '1.5rem', padding: '0.75rem 1.5rem',
        background: bg, color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer'
    };
}

const ghostBtn = {
    padding: '0.4rem 0.8rem', background: 'transparent',
    border: '1px solid #475569', color: '#9ca3af',
    borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem',
};
