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

export default function TeamSelection() {
    const { code } = useParams();
    const navigate = useNavigate();

    const socketRef = useRef(null);
    const [roomState, setRoomState] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(true);

    // Guest name input if not logged in
    const [studentNameInput, setStudentNameInput] = useState('');
    const [name, setName] = useState(() => localStorage.getItem('studentName') || '');
    const [token, setToken] = useState(() => {
        let t = localStorage.getItem('studentToken');
        if (!t && localStorage.getItem('studentName')) {
            t = `student-${Math.random().toString(36).substr(2, 9)}`;
            localStorage.setItem('studentToken', t);
        }
        return t || '';
    });

    // Create team state
    const [showCreateTeam, setShowCreateTeam] = useState(false);
    const [newTeamName, setNewTeamName] = useState('');
    const [selectedColor, setSelectedColor] = useState('#3b82f6');
    const [createError, setCreateError] = useState(null);
    const [creatingTeam, setCreatingTeam] = useState(false);
    const [copied, setCopied] = useState(false);

    const handleJoinWithName = (e) => {
        e.preventDefault();
        const trimmed = studentNameInput.trim();
        if (!trimmed) return;
        const newToken = `student-${Math.random().toString(36).substr(2, 9)}`;
        localStorage.setItem('studentName', trimmed);
        localStorage.setItem('studentToken', newToken);
        setName(trimmed);
        setToken(newToken);
        setLoading(true);
        setError(null);
    };

    useEffect(() => {
        if (!name || !token) {
            setLoading(false);
            return;
        }

        const socket = io(SOCKET_URL, {
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionAttempts: 5,
        });
        socketRef.current = socket;

        // Safety timeout in case room is inactive or socket fails silently
        const timeout = setTimeout(() => {
            if (loading) {
                setError('Battle room is not responding or may have expired.');
                setLoading(false);
            }
        }, 8000);

        socket.on('connect', () => {
            clearTimeout(timeout);
            socket.emit('join_room', {
                code: code?.toUpperCase(),
                displayName: name,
                sessionTokenHash: token,
                role: 'player',
                studentId: parseInt(localStorage.getItem('studentId')) || undefined,
            }, (ack) => {
                clearTimeout(timeout);
                if (!ack?.success) {
                    setError(ack?.error || 'Could not join battle');
                    setLoading(false);
                } else if (ack?.lobbyState) {
                    setRoomState(ack.lobbyState);
                    setLoading(false);
                } else {
                    setLoading(false);
                }
            });
        });

        socket.on('room_state', (state) => {
            setRoomState(state);
            setLoading(false);
            if (!state.players?.some(p => p.sessionTokenHash === token && p.teamId) && (!state.teams || state.teams.length === 0)) {
                setShowCreateTeam(true);
            }
        });

        socket.on('reconnect_state', (state) => {
            if (state?.roomState) {
                setRoomState(state.roomState);
            }
            setLoading(false);
        });

        socket.on('team_updated', (teamState) => {
            setRoomState(prev => prev ? { ...prev, ...teamState } : null);
        });

        socket.on('question_active', () => {
            navigate(`/student/battle/${code}/game`);
        });

        socket.on('connect_error', (err) => {
            setError(`Connection error: ${err.message}`);
            setLoading(false);
        });

        socket.on('error', (err) => {
            setError(err.message || 'An error occurred');
            setLoading(false);
        });

        return () => {
            clearTimeout(timeout);
            socket.disconnect();
        };
    }, [code, token, name, navigate]);

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

    const handleCreateTeam = (e) => {
        e.preventDefault();
        setCreateError(null);
        if (!newTeamName.trim()) {
            setCreateError('Team name is required');
            return;
        }
        if (!socketRef.current) return;
        setCreatingTeam(true);
        socketRef.current.emit('create_team', {
            name: newTeamName.trim(),
            color: selectedColor
        }, (ack) => {
            setCreatingTeam(false);
            if (!ack?.success) {
                setCreateError(ack?.error || 'Failed to create team');
            } else {
                setNewTeamName('');
                setShowCreateTeam(false);
            }
        });
    };

    // If student has not set a name yet, prompt cleanly on screen instead of blanking or bouncing to login
    if (!name || !token) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#0f172a', color: 'white', padding: '1.5rem' }}>
                <form onSubmit={handleJoinWithName} style={{ background: '#1e293b', padding: '2rem', borderRadius: '12px', width: '100%', maxWidth: '420px', border: '1px solid #334155', boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }}>
                    <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                        <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>⚔️</div>
                        <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.5rem' }}>Join Team Battle</h2>
                        <div style={{ display: 'inline-block', padding: '0.2rem 0.8rem', background: '#3b82f620', border: '1px solid #3b82f6', color: '#60a5fa', borderRadius: '6px', fontWeight: 'bold', letterSpacing: '2px' }}>
                            ROOM: {code?.toUpperCase()}
                        </div>
                    </div>

                    <div style={{ marginBottom: '1.5rem' }}>
                        <label style={{ display: 'block', color: '#9ca3af', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
                            Your Full Name or Gamer Tag
                        </label>
                        <input
                            type="text"
                            value={studentNameInput}
                            onChange={e => setStudentNameInput(e.target.value)}
                            placeholder="e.g. Rahul Sharma"
                            required
                            autoFocus
                            style={{
                                width: '100%', padding: '0.75rem', borderRadius: '8px',
                                border: '1px solid #334155', background: '#0f172a', color: 'white',
                                fontSize: '1.1rem'
                            }}
                        />
                    </div>

                    <button type="submit" style={{ width: '100%', ...btnStyle('#10b981'), padding: '0.9rem', fontSize: '1.1rem' }}>
                        Enter Battle Arena →
                    </button>

                    <div style={{ textAlign: 'center', marginTop: '1rem' }}>
                        <Link to="/student/battle" style={{ color: '#9ca3af', fontSize: '0.85rem', textDecoration: 'none' }}>
                            ← Back to Battles
                        </Link>
                    </div>
                </form>
            </div>
        );
    }

    if (error) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#0f172a', color: 'white', padding: '2rem' }}>
                <div style={{ padding: '2.5rem', background: '#1e293b', border: '1px solid #ef4444', borderRadius: '12px', maxWidth: '520px', textAlign: 'center', boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>⚠️</div>
                    <h2 style={{ color: '#f87171', margin: '0 0 1rem' }}>Unable to Join Battle</h2>
                    <p style={{ color: '#cbd5e1', fontSize: '1.05rem', lineHeight: '1.5', marginBottom: '1.5rem' }}>{error}</p>
                    <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                        <button onClick={() => navigate('/student/battle')} style={btnStyle('#3b82f6')}>
                            🌐 Browse Active Battles
                        </button>
                        <button onClick={() => navigate('/join')} style={btnStyle('#475569')}>
                            🔢 Enter Another Code
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (loading) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#0f172a', color: 'white' }}>
                <div style={{ fontSize: '2.5rem', animation: 'bounce 1s infinite' }}>⚔️</div>
                <p style={{ color: '#9ca3af', marginTop: '1rem', fontSize: '1.1rem' }}>Connecting to battle room {code?.toUpperCase()}...</p>
            </div>
        );
    }

    if (!roomState) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#0f172a', color: 'white', padding: '2rem' }}>
                <div style={{ padding: '2rem', background: '#1e293b', borderRadius: '12px', textAlign: 'center', maxWidth: '450px' }}>
                    <h3 style={{ margin: '0 0 1rem' }}>Battle Not Found</h3>
                    <p style={{ color: '#9ca3af', marginBottom: '1.5rem' }}>The battle room may have finished or expired.</p>
                    <button onClick={() => navigate('/student/battle')} style={btnStyle('#3b82f6')}>
                        ← Back to Battles
                    </button>
                </div>
            </div>
        );
    }

    const teamMode = roomState.settings?.teamMode;
    const teams = roomState.teamState?.teams || roomState.teams || [];
    const unassignedPlayers = roomState.teamState?.unassignedPlayers || 
        (roomState.players?.filter(p => p.displayName !== 'Host' && !p.teamId) || []);
    
    const myPlayer = roomState.players?.find(p => p.displayName === name || p.sessionTokenHash === token);
    const myTeamId = myPlayer?.teamId;
    const myTeam = myTeamId ? teams.find(t => String(t.id) === String(myTeamId)) : null;
    const myReady = Boolean(myPlayer?.isReady);
    
    const maxTeamSize = roomState.settings?.teamSizeLimit || 4;
    const totalTeams = roomState.settings?.teamCount || teams.length;

    return (
        <div style={{ minHeight: '100vh', background: '#0f172a', color: 'white' }}>
            {/* Header */}
            <header style={{ padding: '1rem 2rem', background: '#1e293b', borderBottom: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <Link to="/student/battle" style={{ color: 'white', textDecoration: 'none', fontSize: '1.25rem', fontWeight: 'bold' }}>⚔️ Team Battle</Link>
                    <div style={{ fontSize: '1.5rem', fontWeight: '800', letterSpacing: '0.2rem', color: '#10b981', fontFamily: 'monospace' }}>{code?.toUpperCase()}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <span style={{ color: '#9ca3af' }}>👤 {name}</span>
                </div>
            </header>

            <main style={{ maxWidth: '900px', margin: '0 auto', padding: '2rem' }}>
                {/* Battle Info with Team Settings */}
                <div style={{ ...cardStyle, marginBottom: '2rem', textAlign: 'center' }}>
                    <h2 style={{ margin: '0 0 0.5rem' }}>{roomState.battle_name || 'Team Battle'}</h2>
                    <p style={{ color: '#9ca3af', margin: 0 }}>Select your team and get ready for battle!</p>
                    
                    {/* Team Settings Badge */}
                    <div style={{ display: 'inline-flex', gap: '1.5rem', marginTop: '1rem', padding: '0.75rem 1rem', background: '#0f172a', borderRadius: '8px', border: '1px solid #334155', flexWrap: 'wrap', justifyContent: 'center' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#fbbf24' }}>
                            <span style={{ fontSize: '1.2rem' }}>👥</span>
                            <span>Max Team Size: <strong style={{ color: 'white', fontSize: '1.1rem' }}>{maxTeamSize}</strong></span>
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#3b82f6' }}>
                            <span style={{ fontSize: '1.2rem' }}>🏷️</span>
                            <span>Total Teams: <strong style={{ color: 'white', fontSize: '1.1rem' }}>{totalTeams}</strong></span>
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#10b981' }}>
                            <span style={{ fontSize: '1.2rem' }}>❓</span>
                            <span>Questions: <strong style={{ color: 'white', fontSize: '1.1rem' }}>{roomState.settings?.questionCount || roomState.questions?.length || '?'}</strong></span>
                        </span>
                    </div>
                </div>

                {!teamMode && (
                    <div style={{ ...cardStyle, textAlign: 'center', padding: '3rem' }}>
                        <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>👥</div>
                        <h3 style={{ margin: '0 0 0.5rem' }}>Individual Mode</h3>
                        <p style={{ color: '#9ca3af' }}>This battle doesn't use teams. Waiting for host to start...</p>
                    </div>
                )}

                {teamMode && (
                    <>
                        {/* Unassigned - Prompt to join team */}
                        {!myTeamId && (
                            <div style={{ ...cardStyle, marginBottom: '2rem', textAlign: 'center', border: '2px solid #fbbf24' }}>
                                <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🏷️</div>
                                <h3 style={{ margin: '0 0 0.5rem', color: '#fbbf24' }}>You haven't joined a team yet!</h3>
                                <p style={{ color: '#9ca3af', margin: 0 }}>Select an existing team below or create your own team to compete.</p>
                            </div>
                        )}

                        {/* My Team Status */}
                        {myTeamId && myTeam && (
                            <div style={{ ...cardStyle, marginBottom: '2rem', border: `2px solid ${myTeam.color || '#3b82f6'}` }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: myTeam.color || '#3b82f6' }} />
                                        <div>
                                            <h3 style={{ margin: 0, color: myTeam.color || '#3b82f6' }}>{myTeam.name || 'My Team'}</h3>
                                            <span style={{ color: '#9ca3af', fontSize: '0.9rem' }}>{myTeam.members?.length || 0}/{maxTeamSize} members</span>
                                        </div>
                                    </div>
                                    <button
                                        onClick={leaveTeam}
                                        style={{ ...btnStyle('transparent'), border: '1px solid #ef4444', color: '#ef4444', padding: '0.5rem 1rem' }}
                                    >
                                        Leave Team
                                    </button>
                                </div>
                                
                                {/* Team Members */}
                                <div style={{ marginBottom: '1rem' }}>
                                    {(myTeam.members || []).map((member, idx) => (
                                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem', background: '#0f172a', borderRadius: '4px', marginBottom: '0.25rem' }}>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <span>{member.connected ? '🟢' : '🔴'}</span>
                                                {member.displayName} {(member.displayName === name || member.sessionTokenHash === token) && <span style={{ color: '#3b82f6', fontSize: '0.8rem' }}>(You)</span>}
                                                {member.isReady && <span style={{ color: '#10b981', fontSize: '0.8rem' }}>✓ Ready</span>}
                                            </span>
                                        </div>
                                    ))}
                                </div>

                                {/* Ready Toggle */}
                                <button
                                    onClick={() => toggleReady(!myReady)}
                                    disabled={roomState.state !== 'LOBBY'}
                                    style={{
                                        width: '100%',
                                        ...btnStyle(myReady ? '#10b981' : '#3b82f6'),
                                        padding: '1rem',
                                        fontSize: '1.1rem'
                                    }}
                                >
                                    {myReady ? '✓ Ready - Click to Unready' : 'Not Ready - Click to Ready Up'}
                                </button>
                            </div>
                        )}

                        {/* Available Teams */}
                        <div style={{ ...cardStyle }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                                <div>
                                    <h3 style={{ margin: 0 }}>Available Teams (Max {maxTeamSize} per team)</h3>
                                    {myTeamId && <span style={{ fontSize: '0.85rem', color: '#9ca3af' }}>Click any team to switch</span>}
                                </div>
                                {roomState.state === 'LOBBY' && (
                                    <button
                                        onClick={() => { setShowCreateTeam(!showCreateTeam); setCreateError(null); }}
                                        style={{ ...btnStyle(showCreateTeam ? '#475569' : '#10b981'), padding: '0.5rem 1rem', fontSize: '0.9rem' }}
                                    >
                                        {showCreateTeam ? '✕ Cancel' : '➕ Create New Team'}
                                    </button>
                                )}
                            </div>

                            {/* Create Team Form Modal / Box */}
                            {showCreateTeam && (
                                <form onSubmit={handleCreateTeam} style={{
                                    background: '#0f172a', padding: '1.25rem', borderRadius: '8px',
                                    border: '1px solid #3b82f6', marginBottom: '1.5rem', display: 'flex',
                                    flexDirection: 'column', gap: '1rem'
                                }}>
                                    <h4 style={{ margin: 0, color: '#60a5fa' }}>🎯 Apni Team Ka Naam Rakhein (Create Your Team)</h4>
                                    
                                    {createError && (
                                        <div style={{ padding: '0.5rem', background: '#ef444420', border: '1px solid #ef4444', color: '#fca5a5', borderRadius: '4px', fontSize: '0.85rem' }}>
                                            {createError}
                                        </div>
                                    )}

                                    <div>
                                        <label style={{ display: 'block', color: '#9ca3af', marginBottom: '0.3rem', fontSize: '0.85rem' }}>
                                            Team Name (Apni pasand ka naam)
                                        </label>
                                        <input
                                            type="text"
                                            value={newTeamName}
                                            onChange={e => setNewTeamName(e.target.value)}
                                            placeholder="e.g. Code Ninjas, Thunderbolts, Placement Warriors"
                                            maxLength={30}
                                            required
                                            style={{
                                                width: '100%', padding: '0.6rem', borderRadius: '4px',
                                                border: '1px solid #334155', background: '#1e293b', color: 'white',
                                                fontSize: '1rem'
                                            }}
                                            autoFocus
                                        />
                                    </div>

                                    <div>
                                        <label style={{ display: 'block', color: '#9ca3af', marginBottom: '0.3rem', fontSize: '0.85rem' }}>
                                            Team Color
                                        </label>
                                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                            {['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'].map(c => (
                                                <button
                                                    key={c}
                                                    type="button"
                                                    onClick={() => setSelectedColor(c)}
                                                    style={{
                                                        width: '28px', height: '28px', borderRadius: '50%', background: c,
                                                        border: selectedColor === c ? '3px solid white' : '2px solid transparent',
                                                        cursor: 'pointer', outline: 'none'
                                                    }}
                                                />
                                            ))}
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                        <button
                                            type="button"
                                            onClick={() => setShowCreateTeam(false)}
                                            style={{ ...btnStyle('transparent'), border: '1px solid #475569', color: '#9ca3af', padding: '0.5rem 1rem' }}
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={creatingTeam}
                                            style={{ ...btnStyle(selectedColor), padding: '0.5rem 1.25rem' }}
                                        >
                                            {creatingTeam ? 'Creating...' : '✓ Create & Join'}
                                        </button>
                                    </div>
                                </form>
                            )}

                            {teams.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '2rem', color: '#9ca3af' }}>
                                    No teams created yet. Click "➕ Create New Team" to form the first team!
                                </div>
                            ) : (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
                                    {teams.map(team => {
                                        const members = team.members || [];
                                        const memberCount = members.length;
                                        const isFull = memberCount >= maxTeamSize;
                                        const isMyTeam = Boolean(myTeamId && String(team.id) === String(myTeamId));
                                        const teamCol = team.color || '#3b82f6';

                                        return (
                                            <div key={team.id} style={{
                                                ...cardStyle,
                                                border: `2px solid ${isMyTeam ? teamCol : (isFull ? '#ef4444' : teamCol)}`,
                                                background: isMyTeam ? `${teamCol}20` : '#1e293b',
                                                cursor: !myTeamId && !isFull ? 'pointer' : 'default',
                                                opacity: myTeamId && !isMyTeam ? 0.75 : 1
                                            }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                        <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: teamCol }} />
                                                        <h4 style={{ margin: 0, color: isMyTeam ? teamCol : 'white' }}>{team.name}</h4>
                                                        {isMyTeam && <span style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem', background: teamCol, borderRadius: '999px', color: 'white' }}>YOUR TEAM</span>}
                                                        {isFull && !isMyTeam && <span style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem', background: '#ef4444', borderRadius: '999px', color: 'white' }}>FULL</span>}
                                                    </div>
                                                    <span style={{ color: '#9ca3af', fontSize: '0.85rem' }}>{memberCount}/{maxTeamSize}</span>
                                                </div>

                                                {memberCount > 0 && (
                                                    <div style={{ marginBottom: '0.5rem', fontSize: '0.85rem' }}>
                                                        {members.map((m, idx) => (
                                                            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0', color: '#9ca3af' }}>
                                                                <span>{m.displayName}</span>
                                                                {m.isReady && <span style={{ color: '#10b981' }}>✓</span>}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}

                                                {!myTeamId && !isFull && (
                                                    <button
                                                        onClick={() => joinTeam(team.id)}
                                                        style={{ width: '100%', marginTop: '0.5rem', ...btnStyle(teamCol), padding: '0.5rem' }}
                                                    >
                                                        Join {team.name}
                                                    </button>
                                                )}

                                                {myTeamId && !isMyTeam && (
                                                    <button
                                                        onClick={() => joinTeam(team.id)}
                                                        disabled={isFull}
                                                        style={{ width: '100%', marginTop: '0.5rem', ...btnStyle('transparent'), border: '1px solid #475569', color: '#9ca3af', padding: '0.5rem', opacity: isFull ? 0.5 : 1 }}
                                                    >
                                                        {isFull ? 'Team Full' : 'Switch to this team'}
                                                    </button>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </>
                )}

                {/* Battle Code */}
                <div style={{ ...cardStyle, marginTop: '2rem', textAlign: 'center' }}>
                    <h3 style={{ margin: '0 0 1rem' }}>Share Battle Code</h3>
                    <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                        <button
                            onClick={() => {
                                navigator.clipboard?.writeText(code?.toUpperCase() || '');
                                setCopied(true);
                                setTimeout(() => setCopied(false), 2000);
                            }}
                            style={{ ...btnStyle('#3b82f6') }}
                        >
                            {copied ? '✓ Code Copied!' : '📋 Copy Code'}
                        </button>
                        <button
                            onClick={() => {
                                navigator.clipboard?.writeText(`${window.location.origin}/student/battle/${code?.toUpperCase()}/select-team`);
                                setCopied(true);
                                setTimeout(() => setCopied(false), 2000);
                            }}
                            style={{ ...btnStyle('#8b5cf6') }}
                        >
                            🔗 Copy Link
                        </button>
                    </div>
                    <p style={{ color: '#9ca3af', marginTop: '0.5rem', fontSize: '0.9rem' }}>
                        Share this code with friends: <strong style={{ color: 'white' }}>{code?.toUpperCase()}</strong>
                    </p>
                </div>
            </main>
        </div>
    );
}
