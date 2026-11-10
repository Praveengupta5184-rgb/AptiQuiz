import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api';
import TournamentBracket from '../components/TournamentBracket';

export default function TournamentDashboard() {
    const { id } = useParams();
    const navigate = useNavigate();

    const [tourneyData, setTourneyData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [activeTab, setActiveTab] = useState('bracket'); // 'bracket' | 'teams' | 'register' | 'manage'

    // Registration Form State
    const [teamName, setTeamName] = useState('');
    const [memberEmails, setMemberEmails] = useState(['', '', '']);
    const [regSubmitting, setRegSubmitting] = useState(false);
    const [regSuccess, setRegSuccess] = useState(false);

    // Match Management Modal
    const [selectedMatch, setSelectedMatch] = useState(null);
    const [matchWinnerId, setMatchWinnerId] = useState('');
    const [score1, setScore1] = useState(0);
    const [score2, setScore2] = useState(0);

    const isTeacher = !!localStorage.getItem('teacherToken');

    const loadData = () => {
        setLoading(true);
        api.getTournament(id)
            .then(data => {
                setTourneyData(data);
                setLoading(false);
            })
            .catch(err => {
                setError(err.message || 'Failed to load tournament');
                setLoading(false);
            });
    };

    useEffect(() => {
        if (id) loadData();
    }, [id]);

    const handleRegisterTeam = async (e) => {
        e.preventDefault();
        if (!teamName.trim()) return;
        setRegSubmitting(true);
        try {
            await api.registerTournamentTeam(id, {
                teamName: teamName.trim(),
                memberEmails: memberEmails.filter(Boolean)
            });
            setRegSuccess(true);
            setTeamName('');
            loadData();
            setTimeout(() => {
                setRegSuccess(false);
                setActiveTab('teams');
            }, 1500);
        } catch (err) {
            alert(err.message || 'Registration failed');
        } finally {
            setRegSubmitting(false);
        }
    };

    const handleStartTournament = async () => {
        if (!window.confirm('Start this tournament and generate brackets now? Teams will no longer be able to register.')) return;
        try {
            await api.startTournament(id);
            loadData();
        } catch (err) {
            alert(err.message || 'Failed to start tournament');
        }
    };

    const handleDeclareWinner = async () => {
        if (!matchWinnerId || !selectedMatch) return;
        try {
            await api.declareMatchWinner(id, selectedMatch.id, {
                winnerTeamId: parseInt(matchWinnerId),
                team1Score: parseInt(score1),
                team2Score: parseInt(score2)
            });
            setSelectedMatch(null);
            loadData();
        } catch (err) {
            alert(err.message || 'Failed to update match');
        }
    };

    if (loading) return <div style={{ color: '#9ca3af', padding: '3rem', textAlign: 'center' }}>Loading Tournament...</div>;
    if (error || !tourneyData) return <div style={{ color: '#ef4444', padding: '3rem', textAlign: 'center' }}>{error || 'Not found'}</div>;

    const { tournament, teams, rounds, matches, podium } = tourneyData;

    return (
        <div style={{ color: 'white', maxWidth: '1200px', margin: '0 auto', padding: '1rem' }}>
            {/* Header / Hero */}
            <div style={{
                background: 'linear-gradient(135deg, #1e293b, #0f172a)',
                borderRadius: '12px', border: '1px solid #334155',
                padding: '2rem', marginBottom: '2rem', position: 'relative'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                            <span style={{
                                padding: '0.2rem 0.6rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 'bold',
                                background: tournament.status === 'in_progress' ? '#10b98122' : tournament.status === 'completed' ? '#fbbf2422' : '#3b82f622',
                                color: tournament.status === 'in_progress' ? '#10b981' : tournament.status === 'completed' ? '#fbbf24' : '#3b82f6',
                                textTransform: 'uppercase'
                            }}>
                                {tournament.status.replace('_', ' ')}
                            </span>
                            <span style={{ color: '#9ca3af', fontSize: '0.85rem' }}>{tournament.category} • {tournament.difficulty}</span>
                        </div>
                        <h1 style={{ margin: '0 0 0.5rem', fontSize: '2rem' }}>{tournament.name}</h1>
                        <p style={{ color: '#94a3af', margin: 0, maxWidth: '650px' }}>{tournament.description || 'No description provided.'}</p>
                    </div>

                    {isTeacher && tournament.status === 'registration' && (
                        <button
                            onClick={handleStartTournament}
                            style={{
                                padding: '0.8rem 1.5rem', background: '#10b981', color: 'white',
                                border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer',
                                boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)'
                            }}
                        >
                            🚀 Start Tournament & Generate Brackets
                        </button>
                    )}
                </div>

                {/* Key stats row */}
                <div style={{ display: 'flex', gap: '2rem', marginTop: '1.5rem', borderTop: '1px solid #334155', paddingTop: '1rem', flexWrap: 'wrap' }}>
                    <div>
                        <div style={{ color: '#64748b', fontSize: '0.75rem' }}>Teams Registered</div>
                        <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{teams.length} / {tournament.max_teams}</div>
                    </div>
                    <div>
                        <div style={{ color: '#64748b', fontSize: '0.75rem' }}>Team Size</div>
                        <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{tournament.team_size} players</div>
                    </div>
                    <div>
                        <div style={{ color: '#64748b', fontSize: '0.75rem' }}>Rounds</div>
                        <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{tournament.rounds_count}</div>
                    </div>
                    <div>
                        <div style={{ color: '#64748b', fontSize: '0.75rem' }}>Organizer</div>
                        <div style={{ fontWeight: 'bold', fontSize: '1.1rem', color: '#60a5fa' }}>{tournament.organizer_name || 'Teacher'}</div>
                    </div>
                </div>
            </div>

            {/* Podium Banner (if completed) */}
            {podium && (
                <div style={{
                    background: 'linear-gradient(90deg, #fbbf2422, #1e293b, #f59e0b22)',
                    border: '2px solid #fbbf24', borderRadius: '12px', padding: '1.5rem',
                    marginBottom: '2rem', textAlign: 'center'
                }}>
                    <h2 style={{ color: '#fbbf24', margin: '0 0 1rem', fontSize: '1.6rem' }}>🏆 Tournament Completed!</h2>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '3rem', flexWrap: 'wrap' }}>
                        <div>
                            <div style={{ fontSize: '2rem' }}>🥇</div>
                            <div style={{ color: '#64748b', fontSize: '0.8rem' }}>CHAMPION</div>
                            <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#fbbf24' }}>{podium.champion_name}</div>
                        </div>
                        {podium.runner_up_name && (
                            <div>
                                <div style={{ fontSize: '2rem' }}>🥈</div>
                                <div style={{ color: '#64748b', fontSize: '0.8rem' }}>RUNNER-UP</div>
                                <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#94a3b8' }}>{podium.runner_up_name}</div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Navigation Tabs */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid #334155', paddingBottom: '0.5rem' }}>
                <button
                    onClick={() => setActiveTab('bracket')}
                    style={{
                        padding: '0.6rem 1.2rem', background: activeTab === 'bracket' ? '#3b82f6' : 'transparent',
                        color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold'
                    }}
                >
                    🗺️ Bracket View
                </button>
                <button
                    onClick={() => setActiveTab('teams')}
                    style={{
                        padding: '0.6rem 1.2rem', background: activeTab === 'teams' ? '#3b82f6' : 'transparent',
                        color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold'
                    }}
                >
                    👥 Teams ({teams.length})
                </button>
                {tournament.status === 'registration' && !isTeacher && (
                    <button
                        onClick={() => setActiveTab('register')}
                        style={{
                            padding: '0.6rem 1.2rem', background: activeTab === 'register' ? '#10b981' : 'transparent',
                            color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold'
                        }}
                    >
                        ✍️ Register Team
                    </button>
                )}
            </div>

            {/* TAB: Bracket */}
            {activeTab === 'bracket' && (
                <div style={{ background: '#1e293b', borderRadius: '12px', padding: '1.5rem', border: '1px solid #334155' }}>
                    <TournamentBracket
                        rounds={rounds}
                        matches={matches}
                        isHost={isTeacher}
                        onMatchClick={(match) => {
                            if (isTeacher && match.status !== 'completed' && match.team1_id && match.team2_id) {
                                setSelectedMatch(match);
                                setMatchWinnerId(match.team1_id.toString());
                                setScore1(0);
                                setScore2(0);
                            }
                        }}
                    />
                </div>
            )}

            {/* TAB: Teams */}
            {activeTab === 'teams' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
                    {teams.map((t, idx) => (
                        <div key={t.id} style={{ background: '#1e293b', padding: '1.25rem', borderRadius: '10px', border: '1px solid #334155' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                <span style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>#{idx + 1} {t.name}</span>
                                <span style={{ fontSize: '0.75rem', color: '#10b981' }}>{t.status}</span>
                            </div>
                            <div style={{ color: '#9ca3af', fontSize: '0.8rem', marginBottom: '0.75rem' }}>
                                Captain: <strong style={{ color: 'white' }}>{t.captain_name}</strong>
                            </div>
                            <div style={{ borderTop: '1px solid #334155', paddingTop: '0.5rem' }}>
                                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Members:</span>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginTop: '0.2rem' }}>
                                    {(t.members || []).map(m => (
                                        <span key={m.id} style={{ fontSize: '0.75rem', background: '#0f172a', padding: '2px 8px', borderRadius: '4px' }}>
                                            {m.displayName}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* TAB: Register Team */}
            {activeTab === 'register' && (
                <div style={{ maxWidth: '600px', margin: '0 auto', background: '#1e293b', padding: '2rem', borderRadius: '12px', border: '1px solid #334155' }}>
                    <h3 style={{ margin: '0 0 1rem' }}>Register Your Team</h3>
                    {regSuccess && (
                        <div style={{ padding: '0.8rem', background: '#10b98122', border: '1px solid #10b981', color: '#10b981', borderRadius: '6px', marginBottom: '1rem' }}>
                            Team registered successfully!
                        </div>
                    )}
                    <form onSubmit={handleRegisterTeam}>
                        <div style={{ marginBottom: '1rem' }}>
                            <label style={{ display: 'block', color: '#9ca3af', marginBottom: '0.3rem', fontSize: '0.9rem' }}>Team Name *</label>
                            <input
                                type="text"
                                required
                                placeholder="e.g. Code Warriors"
                                value={teamName}
                                onChange={e => setTeamName(e.target.value)}
                                style={{ width: '100%', padding: '0.6rem', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: 'white' }}
                            />
                        </div>

                        <div style={{ marginBottom: '1.5rem' }}>
                            <label style={{ display: 'block', color: '#9ca3af', marginBottom: '0.3rem', fontSize: '0.9rem' }}>Invite Teammates by Email (Optional)</label>
                            {memberEmails.map((email, i) => (
                                <input
                                    key={i}
                                    type="email"
                                    placeholder={`Teammate #${i + 1} email`}
                                    value={email}
                                    onChange={e => {
                                        const copy = [...memberEmails];
                                        copy[i] = e.target.value;
                                        setMemberEmails(copy);
                                    }}
                                    style={{ width: '100%', padding: '0.5rem', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: 'white', marginBottom: '0.5rem' }}
                                />
                            ))}
                        </div>

                        <button
                            type="submit"
                            disabled={regSubmitting}
                            style={{
                                width: '100%', padding: '0.8rem', background: '#10b981', color: 'white',
                                border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer'
                            }}
                        >
                            {regSubmitting ? 'Registering...' : 'Confirm Registration'}
                        </button>
                    </form>
                </div>
            )}

            {/* Match Management Modal (For Organizer) */}
            {selectedMatch && (
                <div style={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 9999,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem'
                }}>
                    <div style={{ background: '#1e293b', borderRadius: '12px', border: '1px solid #334155', padding: '1.5rem', maxWidth: '450px', width: '100%' }}>
                        <h3 style={{ margin: '0 0 1rem' }}>Match #{selectedMatch.match_number} Controls</h3>
                        <p style={{ color: '#9ca3af', fontSize: '0.85rem' }}>Record the match scores and select which team advances.</p>

                        <div style={{ marginBottom: '1rem' }}>
                            <label style={{ display: 'block', color: '#9ca3af', marginBottom: '0.3rem' }}>{selectedMatch.team1_name} Score:</label>
                            <input
                                type="number"
                                value={score1}
                                onChange={e => setScore1(e.target.value)}
                                style={{ width: '100%', padding: '0.5rem', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: 'white' }}
                            />
                        </div>

                        <div style={{ marginBottom: '1rem' }}>
                            <label style={{ display: 'block', color: '#9ca3af', marginBottom: '0.3rem' }}>{selectedMatch.team2_name} Score:</label>
                            <input
                                type="number"
                                value={score2}
                                onChange={e => setScore2(e.target.value)}
                                style={{ width: '100%', padding: '0.5rem', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: 'white' }}
                            />
                        </div>

                        <div style={{ marginBottom: '1.5rem' }}>
                            <label style={{ display: 'block', color: '#9ca3af', marginBottom: '0.3rem' }}>Select Advancing Winner:</label>
                            <select
                                value={matchWinnerId}
                                onChange={e => setMatchWinnerId(e.target.value)}
                                style={{ width: '100%', padding: '0.6rem', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: 'white' }}
                            >
                                <option value={selectedMatch.team1_id}>{selectedMatch.team1_name}</option>
                                <option value={selectedMatch.team2_id}>{selectedMatch.team2_name}</option>
                            </select>
                        </div>

                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                            <button onClick={() => setSelectedMatch(null)} style={{ padding: '0.5rem 1rem', background: 'transparent', border: '1px solid #475569', color: '#9ca3af', borderRadius: '6px', cursor: 'pointer' }}>Cancel</button>
                            <button onClick={handleDeclareWinner} style={{ padding: '0.5rem 1rem', background: '#10b981', border: 'none', color: 'white', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>Advance Winner</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

