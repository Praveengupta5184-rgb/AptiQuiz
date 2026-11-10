import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { io } from 'socket.io-client';
import { SOCKET_URL } from '../api';

const cardStyle = {
    background: '#1e293b',
    padding: '1.5rem',
    borderRadius: '12px',
    border: '1px solid #334155',
};

function btnStyle(bg) {
    return {
        padding: '0.75rem 1.5rem',
        background: bg || '#3b82f6',
        color: 'white',
        border: 'none',
        borderRadius: '8px',
        cursor: 'pointer',
        fontWeight: 'bold',
        fontSize: '1rem'
    };
}

const inputStyle = {
    padding: '0.5rem',
    background: '#0f172a',
    border: '1px solid #3b82f6',
    borderRadius: '4px',
    color: 'white',
};

export default function BattleLobby() {
    const { code } = useParams();
    const navigate = useNavigate();

    const socketRef = useRef(null);
    const [roomState, setRoomState] = useState(null);
    const [error, setError] = useState(null);
    const [isHost, setIsHost] = useState(false);
    const [starting, setStarting] = useState(false);
    const [showTeamEditor, setShowTeamEditor] = useState(false);
    const [newTeamName, setNewTeamName] = useState('');

    const token = localStorage.getItem('studentToken') || localStorage.getItem('teacherToken');
    const name = localStorage.getItem('studentName') || localStorage.getItem('teacherName');
    const isTeacher = !!localStorage.getItem('teacherToken');

    useEffect(() => {
        if (!token || !name) {
            navigate(isTeacher ? '/teacher/login' : '/student/login');
            return;
        }

        const socket = io(SOCKET_URL, {
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionAttempts: 5,
        });
        socketRef.current = socket;

        socket.on('connect', () => {
            socket.emit('join_room', {
                code: code.toUpperCase(),
                displayName: isTeacher ? 'Host' : name,
                sessionTokenHash: token,
                role: isTeacher ? 'host' : 'player',
                studentId: !isTeacher ? (parseInt(localStorage.getItem('studentId')) || undefined) : undefined,
            }, (ack) => {
                if (!ack?.success) {
                    setError(ack?.error || 'Could not join battle');
                } else if (ack?.lobbyState) {
                    setRoomState(ack.lobbyState);
                    setIsHost(isTeacher);
                }
            });
        });

        socket.on('room_state', (state) => {
            setRoomState(state);
        });

        socket.on('team_updated', (teamState) => {
            setRoomState(prev => prev ? { ...prev, ...teamState } : null);
        });

        socket.on('question_active', () => {
            navigate(isTeacher ? `/teacher/room/${code}` : `/student/battle/${code}/game`);
        });

        socket.on('connect_error', (err) => {
            setError(`Connection error: ${err.message}`);
        });

        socket.on('error', (err) => {
            setError(err.message);
        });

        return () => {
            socket.disconnect();
        };
    }, [code, token, name, isTeacher, navigate]);

    // Host actions
    const createTeam = () => {
        if (!socketRef.current || !newTeamName.trim()) return;
        socketRef.current.emit('create_team', { name: newTeamName.trim() }, (ack) => {
            if (ack?.success) {
                setNewTeamName('');
                setShowTeamEditor(false);
            } else {
                alert(ack?.error || 'Failed to create team');
            }
        });
    };

    const assignTeam = (playerId, teamId) => {
        if (!socketRef.current) return;
        socketRef.current.emit('assign_team', { playerId, teamId }, (ack) => {
            if (!ack?.success) alert(ack?.error || 'Failed to assign team');
        });
    };

    const startBattle = () => {
        if (!socketRef.current || starting) return;
        setStarting(true);
        socketRef.current.emit('start_battle', {}, (ack) => {
            setStarting(false);
            if (!ack?.success) setError(ack?.error || 'Failed to start battle');
        });
    };

    const validateStart = () => {
        if (!roomState) return { valid: false, message: 'Loading...' };
        const players = roomState.players?.filter(p => p.displayName !== 'Host') || [];
        if (players.length === 0) return { valid: false, message: 'No players joined yet' };
        if (roomState.settings?.teamMode) {
            const playersWithTeams = players.filter(p => p.teamId);
            if (playersWithTeams.length === 0) return { valid: false, message: 'No players assigned to teams' };
            const teamsWithPlayers = new Set(playersWithTeams.map(p => p.teamId));
            if (teamsWithPlayers.size === 0) return { valid: false, message: 'No teams have players' };
        }
        return { valid: true };
    };

    // Player actions
    const joinTeam = (teamId) => {
        if (!socketRef.current) return;
        socketRef.current.emit('join_team', { teamId }, (ack) => {
            if (!ack?.success) alert(ack?.error || 'Failed to join team');
        });
    };

    const leaveTeam = () => {
        if (!socketRef.current) return;
        socketRef.current.emit('leave_team', {}, (ack) => {
            if (!ack?.success) alert(ack?.error || 'Failed to leave team');
        });
    };

    const toggleReady = (ready) => {
        if (!socketRef.current) return;
        socketRef.current.emit('player_ready', { ready }, (ack) => {
            if (!ack?.success) alert(ack?.error || 'Failed to update ready status');
        });
    };

    // Render
    if (error) {
        return (
            <div style={{ padding: '2rem', color: 'white', textAlign: 'center' }}>
                <div style={{ padding: '1rem', background: '#ef444420', border: '1px solid #ef4444', color: '#fca5a5', borderRadius: '8px', maxWidth: '500px', margin: '0 auto' }}>
                    <strong>Error:</strong> {error}
                </div>
                <button onClick={() => navigate(isTeacher ? '/teacher' : '/student/battle')} style={btnStyle('#3b82f6')}>← Back to Battles</button>
            </div>
        );
    }

    if (!roomState) {
        return <div style={{ padding: '2rem', color: 'white', textAlign: 'center' }}>Loading battle lobby...</div>;
    }

    const validation = validateStart();
    const players = roomState.players?.filter(p => p.displayName !== 'Host') || [];
    const teams = roomState.teamState?.teams || roomState.teams || [];
    const unassignedPlayers = roomState.teamState?.unassignedPlayers || players.filter(p => !p.teamId);
    const teamMode = roomState.settings?.teamMode;

    // Get current player's team
    const myPlayer = roomState.players?.find(p => p.displayName === name);
    const myTeamId = myPlayer?.teamId;
    const myTeam = teams.find(t => t.id === myTeamId);
    const myReady = myPlayer?.isReady;

    return (
        <div style={{ minHeight: '100vh', background: '#0f172a', color: 'white' }}>
            {/* Header */}
            <header style={{ padding: '1rem 2rem', background: '#1e293b', borderBottom: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <Link to={isTeacher ? '/teacher' : '/student/battle'} style={{ color: 'white', textDecoration: 'none', fontSize: '1.25rem', fontWeight: 'bold' }}>⚔️ Team Battle</Link>
                    <div style={{ fontSize: '1.5rem', fontWeight: '800', letterSpacing: '0.2rem', color: '#10b981', fontFamily: 'monospace' }}>{code}</div>
                </div>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <span style={{ color: '#9ca3af' }}>👤 {name} {isHost ? '👑' : ''}</span>
                    {!isHost && (
                        <button onClick={() => navigate(isTeacher ? '/teacher' : '/student/battle')} style={{ ...btnStyle('transparent'), border: '1px solid #475569' }}>Leave</button>
                    )}
                </div>
            </header>

            <main style={{ maxWidth: '1000px', margin: '0 auto', padding: '2rem' }}>
                {/* Battle Info */}
                <div style={{ ...cardStyle, marginBottom: '2rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
                        <h2 style={{ margin: 0 }}>{roomState.battle_name || 'Team Battle'}</h2>
                        <span style={{
                            padding: '0.5rem 1rem',
                            background: roomState.state === 'LOBBY' ? '#10b981' : roomState.state === 'active' ? '#f59e0b' : '#64748b',
                            borderRadius: '999px',
                            fontSize: '0.85rem',
                            fontWeight: 'bold',
                            textTransform: 'uppercase'
                        }}>
                            {roomState.state === 'LOBBY' ? 'Lobby' : roomState.state === 'active' ? 'Live' : 'Finished'}
                        </span>
                    </div>
                    
                    {/* Team Settings Badge - Shows teacher-configured settings */}
                    <div style={{ display: 'flex', gap: '1.5rem', color: '#9ca3af', fontSize: '0.9rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                        <span>👥 {players.length} players</span>
                        <span>🏷️ {teams.length} teams</span>
                        <span>❓ {roomState.settings?.questionCount || '?'} questions</span>
                        <span>⏱️ {roomState.settings?.timePerQuestion || 20}s per question</span>
                        {teamMode && (
                            <>
                                <span style={{ color: '#fbbf24', fontWeight: 'bold' }}>👥 Max Team Size: {roomState.settings?.teamSizeLimit || 4}</span>
                                <span style={{ color: '#3b82f6', fontWeight: 'bold' }}>🏷️ Total Teams: {roomState.settings?.teamCount || teams.length}</span>
                                <span style={{ color: '#10b981', fontWeight: 'bold' }}>👤 Min/Team: {roomState.settings?.minPlayersPerTeam || 1}</span>
                            </>
                        )}
                    </div>
                </div>

                {/* Host Controls */}
                {isHost && (
                    <div style={{ ...cardStyle, marginBottom: '2rem' }}>
                        <h3 style={{ margin: '0 0 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            Host Controls
                            <button onClick={() => setShowTeamEditor(!showTeamEditor)} style={{ ...btnStyle('#3b82f6'), padding: '0.5rem 1rem', fontSize: '0.9rem' }}>
                                {showTeamEditor ? 'Hide' : 'Show'} Team Editor
                            </button>
                        </h3>

                        {showTeamEditor && (
                            <div style={{ marginBottom: '1.5rem' }}>
                                <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                                    <input
                                        type="text"
                                        value={newTeamName}
                                        onChange={e => setNewTeamName(e.target.value)}
                                        placeholder="New team name"
                                        style={inputStyle}
                                    />
                                    <button onClick={createTeam} style={btnStyle('#10b981')}>Create Team</button>
                                </div>
                                <p style={{ color: '#9ca3af', fontSize: '0.9rem' }}>
                                    Or assign players to teams below using the dropdowns.
                                </p>
                            </div>
                        )}

                        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                            <button 
                                onClick={startBattle} 
                                disabled={starting || !validation.valid}
                                style={{ ...btnStyle(validation.valid ? '#10b981' : '#475569'), padding: '1rem 2rem', fontSize: '1.1rem' }}
                            >
                                {starting ? 'Starting...' : `⚔️ Start Battle (${players.length} players)`}
                            </button>
                            {!validation.valid && (
                                <span style={{ color: '#fbbf24', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    ⚠️ {validation.message}
                                </span>
                            )}
                        </div>
                    </div>
                )}

                {/* Team Assignment (Host) or Team Selection (Player) */}
                {teamMode && (
                    <div style={{ ...cardStyle, marginBottom: '2rem' }}>
                        <h3 style={{ margin: '0 0 1rem' }}>
                            {isHost ? 'Team Management' : 'Your Team'}
                        </h3>

                        {/* Unassigned Players */}
                        {unassignedPlayers.length > 0 && (
                            <div style={{ marginBottom: '1.5rem' }}>
                                <h4 style={{ color: '#fbbf24', margin: '0 0 0.5rem' }}>
                                    {isHost ? 'Unassigned Players' : 'Not in a team'}
                                </h4>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                    {unassignedPlayers.map((player, i) => (
                                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', background: '#334155', borderRadius: '8px' }}>
                                            <span>{player.connected ? '🟢' : '🔴'}</span>
                                            <span>{player.displayName}</span>
                                            {isHost && teams.length > 0 && (
                                                <select
                                                    value={player.teamId || ''}
                                                    onChange={e => assignTeam(i, e.target.value ? parseInt(e.target.value) : null)}
                                                    style={{
                                                        padding: '0.25rem 0.5rem',
                                                        background: '#0f172a',
                                                        border: '1px solid #3b82f6',
                                                        borderRadius: '4px',
                                                        color: 'white',
                                                        fontSize: '0.85rem'
                                                    }}
                                                >
                                                    <option value="">Assign to team...</option>
                                                    {teams.map(t => (
                                                        <option key={t.id} value={t.id} style={{ background: '#1e293b' }}>
                                                            {t.name} ({t.members?.length || 0}/{roomState.settings?.teamSizeLimit || 4})
                                                        </option>
                                                    ))}
                                                </select>
                                            )}
                                            {!isHost && myTeamId === null && (
                                                <select
                                                    value={''}
                                                    onChange={e => e.target.value && joinTeam(parseInt(e.target.value))}
                                                    style={{
                                                        padding: '0.25rem 0.5rem',
                                                        background: '#0f172a',
                                                        border: '1px solid #10b981',
                                                        borderRadius: '4px',
                                                        color: 'white',
                                                        fontSize: '0.85rem'
                                                    }}
                                                >
                                                    <option value="">Join a team...</option>
                                                    {teams.map(t => (
                                                        <option key={t.id} value={t.id} style={{ background: '#1e293b' }}>
                                                            {t.name} ({t.members?.length || 0}/{roomState.settings?.teamSizeLimit || 4})
                                                        </option>
                                                    ))}
                                                </select>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Teams */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
                            {teams.map(team => {
                                const members = team.members || [];
                                const memberCount = members.length;
                                const maxSize = roomState.settings?.teamSizeLimit || 4;
                                const isFull = memberCount >= maxSize;
                                const isMyTeam = team.id === myTeamId;

                                return (
                                    <div key={team.id} style={{
                                        ...cardStyle,
                                        border: `2px solid ${isMyTeam ? team.color : (isFull ? '#ef4444' : team.color)}`,
                                        background: isMyTeam ? team.color + '20' : '#1e293b'
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: team.color }} />
                                                <h4 style={{ margin: 0 }}>{team.name}</h4>
                                                {isMyTeam && <span style={{ fontSize: '0.75rem', padding: '0.1rem 0.5rem', background: team.color, borderRadius: '999px', color: 'white' }}>YOUR TEAM</span>}
                                                {isFull && !isMyTeam && <span style={{ fontSize: '0.75rem', padding: '0.1rem 0.5rem', background: '#ef4444', borderRadius: '999px', color: 'white' }}>FULL</span>}
                                            </div>
                                            <span style={{ color: '#9ca3af', fontSize: '0.85rem' }}>{memberCount}/{maxSize}</span>
                                        </div>

                                        {memberCount === 0 ? (
                                            <p style={{ color: '#64748b', fontSize: '0.9rem', margin: 0 }}>No members yet</p>
                                        ) : (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                                {members.map((member, idx) => (
                                                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0.5rem', background: '#0f172a', borderRadius: '4px', fontSize: '0.9rem' }}>
                                                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                            <span>{member.connected ? '🟢' : '🔴'}</span>
                                                            {member.displayName}
                                                            {member.isReady && <span style={{ color: '#10b981', fontSize: '0.75rem' }}>✓ Ready</span>}
                                                        </span>
                                                        {isHost && (
                                                            <button
                                                                onClick={() => assignTeam(idx, null)}
                                                                style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.85rem', padding: '0.25rem' }}
                                                            >
                                                                Remove
                                                            </button>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {!isHost && myTeamId === null && !isFull && (
                                            <button
                                                onClick={() => joinTeam(team.id)}
                                                style={{ width: '100%', marginTop: '0.5rem', ...btnStyle(team.color), padding: '0.5rem' }}
                                            >
                                                Join {team.name}
                                            </button>
                                        )}

                                        {!isHost && myTeamId === team.id && (
                                            <button
                                                onClick={leaveTeam}
                                                style={{ width: '100%', marginTop: '0.5rem', ...btnStyle('transparent'), border: '1px solid #ef4444', color: '#ef4444', padding: '0.5rem' }}
                                            >
                                                Leave Team
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Ready Status */}
                {!isHost && teamMode && myTeamId && (
                    <div style={{ ...cardStyle, marginBottom: '2rem', textAlign: 'center' }}>
                        <h3 style={{ margin: '0 0 1rem' }}>Ready Status</h3>
                        <button
                            onClick={() => toggleReady(!myReady)}
                            disabled={roomState.state !== 'LOBBY'}
                            style={{
                                ...btnStyle(myReady ? '#10b981' : '#3b82f6'),
                                padding: '1rem 3rem',
                                fontSize: '1.25rem'
                            }}
                        >
                            {myReady ? '✓ Ready - Click to Unready' : 'Not Ready - Click to Ready Up'}
                        </button>
                        <p style={{ color: '#9ca3af', marginTop: '0.5rem', fontSize: '0.9rem' }}>
                            The host can start the battle when all players are ready.
                        </p>
                    </div>
                )}

                {/* Players List (non-team mode) */}
                {!teamMode && (
                    <div style={{ ...cardStyle }}>
                        <h3 style={{ margin: '0 0 1rem' }}>Players ({players.length})</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.5rem' }}>
                            {players.map((p, i) => (
                                <div key={i} style={{ padding: '0.75rem', background: '#334155', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <span>{p.connected ? '🟢' : '🔴'}</span>
                                    <span>{p.displayName}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Share Battle Code */}
                <div style={{ ...cardStyle, textAlign: 'center' }}>
                    <h3 style={{ margin: '0 0 1rem' }}>Share Battle Code</h3>
                    <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                        <button onClick={() => navigator.clipboard?.writeText(code)} style={{ ...btnStyle('#3b82f6') }}>
                            📋 Copy Code
                        </button>
                        <button onClick={() => navigator.clipboard?.writeText(`${window.location.origin}/student/battle/${code}`)} style={{ ...btnStyle('#8b5cf6') }}>
                            🔗 Copy Link
                        </button>
                    </div>
                    <p style={{ color: '#9ca3af', marginTop: '0.5rem', fontSize: '0.9rem' }}>
                        Students join at <code style={{ color: 'white' }}>{window.location.origin}/student/join</code> with code <strong>{code}</strong>
                    </p>
                </div>
            </main>
        </div>
    );
}