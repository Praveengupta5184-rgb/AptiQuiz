import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { api, SOCKET_URL } from '../api';
import DynamicLiveLeaderboard from '../components/DynamicLiveLeaderboard';
import CertificateConfigModal from '../components/CertificateConfigModal';

function btnStyle(bg) {
    return {
        display: 'inline-block', marginTop: '1.5rem', padding: '0.75rem 1.5rem',
        background: bg || '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer'
    };
}

const ghostBtn = {
    padding: '0.4rem 0.8rem', background: 'transparent',
    border: '1px solid #475569', color: '#9ca3af',
    borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem',
};

export default function HostLobby() {
    const { testId, code: urlCode } = useParams();
    const navigate = useNavigate();

    const socketRef = useRef(null);
    // Guard against React Strict Mode double-invocation (runs effect twice in dev)
    const roomCreationRef = useRef(false);
    const [room, setRoom] = useState(null);       // { code, hostSocketToken, roomId }
    const [roomState, setRoomState] = useState(null);
    const [error, setError] = useState(null);
    const [starting, setStarting] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);
    const [showCertModal, setShowCertModal] = useState(false);

    // Initialize or rejoin room
    useEffect(() => {
        let cancelled = false;

        async function initRoom() {
            try {
                let roomData = null;

                if (urlCode) {
                    // Rejoining existing room (e.g. on page refresh or from active rooms list)
                    const upperCode = urlCode.toUpperCase();
                    const cachedToken = sessionStorage.getItem(`hostToken_${upperCode}`);
                    const cachedRoomId = sessionStorage.getItem(`roomId_${upperCode}`);
                    if (cachedToken && cachedRoomId && cachedRoomId !== 'undefined' && !isNaN(parseInt(cachedRoomId))) {
                        roomData = { code: upperCode, hostSocketToken: cachedToken, roomId: parseInt(cachedRoomId) };
                    } else {
                        const info = await api.getHostRoomInfo(upperCode);
                        if (!info.success) throw new Error(info.error || 'Failed to load room');
                        if (info.status === 'finished') {
                            navigate(`/teacher/results/${info.roomId}`, { replace: true });
                            return;
                        }
                        roomData = { code: info.code, hostSocketToken: info.hostSocketToken, roomId: info.roomId };
                        sessionStorage.setItem(`hostToken_${info.code}`, info.hostSocketToken);
                        if (info.roomId) sessionStorage.setItem(`roomId_${info.code}`, info.roomId);
                    }
                } else if (testId) {
                    // ── GUARD: prevent React Strict Mode from creating two rooms ──
                    // useRef survives Strict Mode's simulated unmount/remount cycle.
                    if (roomCreationRef.current) return;
                    roomCreationRef.current = true;

                    // Creating room from test setup
                    const searchParams = new URLSearchParams(window.location.search);
                    const teamMode = searchParams.get('teamMode') === 'true';
                    const isPublic = searchParams.get('isPublic') === 'true';
                    const battleName = searchParams.get('battleName') || '';
                    const teamSizeLimit = parseInt(searchParams.get('teamSizeLimit') || '4', 10);
                    const studentCreatedTeams = searchParams.get('studentCreatedTeams') !== 'false';
                    const teamCount = studentCreatedTeams ? 0 : parseInt(searchParams.get('teamCount') || '0', 10);
                    const adaptiveDifficulty = searchParams.get('adaptiveDifficulty') === 'true';
                    const collegeId = searchParams.get('collegeId') ? parseInt(searchParams.get('collegeId'), 10) : null;

                    const data = await api.createRoom({ 
                        questionSetId: testId,
                        collegeId: collegeId,
                        isPublic,
                        battleName,
                        settings: { maxPlayers: 50, advanceEarly: true, teamMode, teamSizeLimit, teamCount, studentCreatedTeams, adaptiveDifficulty, isPublic, battleName } 
                    });

                    if (!data.success) throw new Error(data.error || 'Failed to create room');
                    roomData = data;
                    sessionStorage.setItem(`hostToken_${data.code}`, data.hostSocketToken);
                    if (data.roomId) sessionStorage.setItem(`roomId_${data.code}`, data.roomId);

                    // Update URL to /teacher/room/:code so refreshing reconnects instead of creating a new room!
                    navigate(`/teacher/room/${data.code}`, { replace: true });
                } else {
                    throw new Error('No test or room specified');
                }

                if (cancelled) return;
                setRoom(roomData);

                // Connect to socket as host
                const socket = io(SOCKET_URL, {
                    reconnection: true,
                    reconnectionDelay: 1000,
                    reconnectionAttempts: 5,
                });
                socketRef.current = socket;

                socket.on('connect', () => {
                    socket.emit('join_room', {
                        code: roomData.code,
                        displayName: 'Host',
                        sessionTokenHash: roomData.hostSocketToken,
                        role: 'host',
                    }, (ack) => {
                        if (!ack?.success) setError(ack?.error || 'Failed to join room as host');
                    });
                });

                socket.on('room_state', (state) => {
                    if (!cancelled) setRoomState(state);
                });

                socket.on('team_updated', (teamState) => {
                    if (!cancelled) setRoomState(prev => prev ? { ...prev, ...teamState } : null);
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
                    if (!cancelled) {
                        setIsPaused(false);
                        setRoomState(prev => ({
                            ...prev,
                            state: 'FINISHED',
                            leaderboard: results.leaderboard,
                        }));
                    }
                });

                socket.on('game_paused', (data) => {
                    if (!cancelled) setIsPaused(true);
                });

                socket.on('game_resumed', (data) => {
                    if (!cancelled) setIsPaused(false);
                });

                socket.on('connect_error', (err) => {
                    if (!cancelled) setError(`Connection error: ${err.message}`);
                });

                socket.on('error', (err) => {
                    if (!cancelled) setError(err.message);
                });
            } catch (err) {
                if (!cancelled) setError(err.message);
            }
        }

        initRoom();

        return () => {
            cancelled = true;
            if (socketRef.current) socketRef.current.disconnect();
        };
    }, [testId, urlCode, navigate]);

    const startGame = () => {
        if (!socketRef.current || starting) return;
        setStarting(true);
        socketRef.current.emit('start_game', {}, (ack) => {
            setStarting(false);
            if (!ack?.success) setError(ack?.error || 'Failed to start game');
        });
    };

    const togglePause = () => {
        if (!socketRef.current || actionLoading) return;
        setActionLoading(true);
        const eventName = isPaused ? 'resume_game' : 'pause_game';
        socketRef.current.emit(eventName, {}, (ack) => {
            setActionLoading(false);
            if (ack?.success) {
                setIsPaused(!isPaused);
            } else {
                alert(ack?.error || `Failed to ${isPaused ? 'resume' : 'pause'} test`);
            }
        });
    };

    const terminateTest = (fromLobby = false) => {
        const confirmMsg = fromLobby 
            ? 'Are you sure you want to cancel and delete this room? Students will be disconnected.' 
            : 'Are you sure you want to STOP and CANCEL this active test? This will immediately end the test for all students.';
        if (!window.confirm(confirmMsg)) return;

        if (!socketRef.current || actionLoading) return;
        setActionLoading(true);

        socketRef.current.emit('terminate_room', { reason: 'Teacher cancelled the test.' }, (ack) => {
            setActionLoading(false);
            if (ack?.success) {
                sessionStorage.removeItem(`hostToken_${room?.code}`);
                navigate('/teacher');
            } else {
                alert(ack?.error || 'Failed to cancel test');
            }
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
            <div style={{ minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'white', textAlign: 'center' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '1rem', animation: 'bounce 1s infinite' }}>🚀</div>
                <p style={{ fontSize: '1.1rem', color: '#94a3b8' }}>
                    {urlCode ? `Loading room ${urlCode}...` : 'Preparing test room...'}
                </p>
            </div>
        );
    }

    // ── Finished state ──
    if (roomState.state === 'FINISHED') {
        const exportToCSV = () => {
            if (!roomState.leaderboard || !roomState.leaderboard.players) return;
            const headers = ['Rank', 'Name', 'Score', 'Team ID'];
            const rows = roomState.leaderboard.players.map((p, i) => [i + 1, p.displayName, p.score, p.teamId || '']);
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
                    {roomState.settings?.teamMode && roomState.leaderboard?.teams && (
                        <div style={{ marginBottom: '1.5rem' }}>
                            <h4 style={{ color: '#fbbf24', margin: '0 0 0.5rem', textAlign: 'left' }}>Team Standings</h4>
                            {roomState.leaderboard.teams.map((t, i) => (
                                <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 1rem', background: '#334155', marginBottom: '0.25rem', borderRadius: '4px' }}>
                                    <span>#{i + 1} {t.name}</span>
                                    <strong>{t.score} pts</strong>
                                </div>
                            ))}
                        </div>
                    )}
                    {(Array.isArray(roomState.leaderboard) ? roomState.leaderboard : (roomState.leaderboard?.players || [])).map((p, i) => (
                        <div key={i} style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '0.75rem 1rem', background: i === 0 ? '#1d4ed820' : '#1e293b',
                            borderRadius: '6px', marginBottom: '0.5rem',
                            borderLeft: `4px solid ${i === 0 ? '#fbbf24' : i === 1 ? '#94a3b8' : i === 2 ? '#c2775b' : '#334155'}`
                        }}>
                            <span>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`} {p.displayName} {p.teamId ? `(Team)` : ''}</span>
                            <span style={{ fontWeight: 'bold', color: '#10b981' }}>{p.score} pts</span>
                        </div>
                    ))}
                </div>
                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                    <button onClick={exportToCSV} style={{...btnStyle('#10b981'), display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
                        📊 Download CSV
                    </button>
                    <button onClick={() => setShowCertModal(true)} style={{...btnStyle('#fbbf24'), color: '#0f172a', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
                        📜 Configure & Issue Certificates
                    </button>
                    <button onClick={() => navigate('/teacher')} style={btnStyle('#3b82f6')}>
                        ← Back to Dashboard
                    </button>
                </div>

                {showCertModal && (
                    <CertificateConfigModal
                        roomId={room.roomId}
                        roomCode={room.code}
                        eventName={`Battle Room ${room.code}`}
                        onClose={() => setShowCertModal(false)}
                    />
                )}
            </div>
        );
    }

    // ── Active game state ──
    if (roomState.state === 'QUESTION_ACTIVE' || roomState.state === 'REVEAL') {
        return (
            <div style={{ padding: '2rem', color: 'white' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
                    <div>
                        <h2 style={{ margin: '0 0 0.5rem 0' }}>
                            🔴 LIVE — Room {room.code}
                            <span style={{
                                marginLeft: '1rem', fontSize: '0.9rem', padding: '0.25rem 0.6rem',
                                background: isPaused ? '#ef4444' : roomState.state === 'QUESTION_ACTIVE' ? '#10b981' : '#f59e0b',
                                borderRadius: '1rem', fontWeight: 'bold'
                            }}>
                                {isPaused ? '⏸️ PAUSED' : roomState.state === 'QUESTION_ACTIVE' ? 'Answering' : 'Revealing'}
                            </span>
                        </h2>
                        <span style={{ color: '#9ca3af', fontSize: '0.9rem' }}>
                            {roomState.players?.filter(p => p.connected).length || 0} connected
                        </span>
                    </div>

                    {/* Teacher Live Controls: Pause/Resume and Cancel Test */}
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                        <button
                            onClick={togglePause}
                            disabled={actionLoading}
                            style={{
                                padding: '0.6rem 1.2rem',
                                background: isPaused ? '#10b981' : '#f59e0b',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                fontWeight: 'bold',
                                cursor: actionLoading ? 'not-allowed' : 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.4rem'
                            }}
                        >
                            {isPaused ? '▶️ Resume Test' : '⏸️ Pause Test'}
                        </button>
                        <button
                            onClick={() => terminateTest(false)}
                            disabled={actionLoading}
                            style={{
                                padding: '0.6rem 1.2rem',
                                background: '#ef4444',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                fontWeight: 'bold',
                                cursor: actionLoading ? 'not-allowed' : 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.4rem'
                            }}
                        >
                            🛑 Delete / Cancel Test
                        </button>
                    </div>
                </div>

                {isPaused && (
                    <div style={{
                        padding: '1rem', background: '#ef444420', border: '1px solid #ef4444',
                        color: '#fca5a5', borderRadius: '8px', maxWidth: '600px', margin: '0 auto 1.5rem auto',
                        textAlign: 'center'
                    }}>
                        ⏸️ <strong>Test is currently paused.</strong> Student timers are frozen. Click "Resume Test" when ready.
                    </div>
                )}

                <div style={{ maxWidth: '650px', margin: '0 auto' }}>
                    <h3 style={{ color: '#9ca3af', marginBottom: '0.75rem', textAlign: 'center' }}>Live Standings</h3>
                    <DynamicLiveLeaderboard
                        teams={roomState.leaderboard?.teams || []}
                        players={Array.isArray(roomState.leaderboard) ? roomState.leaderboard : (roomState.leaderboard?.players || [])}
                        isTeamMode={!!roomState.settings?.teamMode}
                    />
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
                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '0.5rem' }}>
                    <button onClick={() => navigator.clipboard?.writeText(room.code)}
                        style={{ ...ghostBtn }}>
                        📋 Copy Code
                    </button>
                    <button onClick={() => navigator.clipboard?.writeText(`${window.location.origin}/spectate/${room.code}`)}
                        style={{ ...ghostBtn }}>
                        👁️ Copy Spectator Link
                    </button>
                </div>
            </div>

            {roomState.settings?.teamMode && (
                <div style={{ background: '#1e293b', borderRadius: '12px', padding: '1.5rem', marginBottom: '2rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span>⚔️ Teams Formation</span>
                            {roomState.settings?.isPublic && (
                                <span style={{ fontSize: '0.75rem', padding: '0.2rem 0.6rem', background: '#3b82f6', borderRadius: '999px', color: 'white' }}>
                                    🌐 Public Battle
                                </span>
                            )}
                        </h3>
                        <span style={{ color: '#9ca3af', fontSize: '0.9rem' }}>
                            {roomState.teams?.length || 0} teams • Max {roomState.settings?.teamSizeLimit || 4} / team
                        </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1rem' }}>
                        {roomState.teams?.map((team) => {
                            const members = roomState.players?.filter(p => p.teamId === team.id && p.displayName !== 'Host') || [];
                            return (
                                <div key={team.id} style={{
                                    background: '#0f172a', padding: '1rem', borderRadius: '8px',
                                    border: `2px solid ${team.color || '#3b82f6'}`
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                        <strong style={{ color: team.color || '#3b82f6' }}>{team.name}</strong>
                                        <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>
                                            {members.length}/{roomState.settings?.teamSizeLimit || 4}
                                        </span>
                                    </div>
                                    {members.length === 0 ? (
                                        <div style={{ color: '#475569', fontSize: '0.8rem', fontStyle: 'italic' }}>No members yet</div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                            {members.map((m, idx) => (
                                                <div key={idx} style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.3rem', color: '#e2e8f0' }}>
                                                    <span>{m.connected ? '🟢' : '🔴'}</span>
                                                    <span>{m.displayName}</span>
                                                    {m.isReady && <span style={{ color: '#10b981', fontSize: '0.75rem' }}>✓</span>}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            <div style={{ background: '#1e293b', borderRadius: '12px', padding: '1.5rem', marginBottom: '2rem' }}>
                <h3 style={{ margin: '0 0 1rem', display: 'flex', justifyContent: 'space-between' }}>
                    <span>{roomState.settings?.teamMode ? 'All Joined Students' : 'Students Joined'}</span>
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

            <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
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

                <button
                    onClick={() => terminateTest(true)}
                    disabled={actionLoading}
                    style={{
                        padding: '0.6rem 1.5rem',
                        fontSize: '0.95rem',
                        background: 'transparent',
                        color: '#ef4444',
                        border: '1px solid #ef4444',
                        borderRadius: '6px',
                        cursor: actionLoading ? 'not-allowed' : 'pointer',
                        fontWeight: 'bold',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem'
                    }}
                >
                    🗑️ Cancel / Delete This Room
                </button>

                <p style={{ color: '#475569', fontSize: '0.8rem', margin: 0 }}>
                    Only you (the host) can start or cancel the test.
                </p>
            </div>
        </div>
    );
}
