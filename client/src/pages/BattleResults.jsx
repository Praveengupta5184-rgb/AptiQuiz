import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../api';

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

export default function BattleResults() {
    const { code } = useParams();
    const navigate = useNavigate();

    const [results, setResults] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const name = localStorage.getItem('studentName');

    const loadResults = useCallback(async () => {
        try {
            setLoading(true);
            // Try to get from localStorage first (from socket event)
            const cached = localStorage.getItem(`battle_results_${code}`);
            if (cached) {
                setResults(JSON.parse(cached));
                setLoading(false);
                return;
            }

            // Fallback to API
            const data = await api.getBattleResults?.(code);
            if (data) {
                setResults(data);
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [code]);

    useEffect(() => {
        loadResults();
    }, [code, loadResults]);

    if (loading) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#0f172a', color: 'white' }}>
                <div style={{ fontSize: '3rem', animation: 'spin 1s linear infinite' }}>⚔️</div>
                <p style={{ color: '#9ca3af', marginTop: '1rem' }}>Loading battle results...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#0f172a', color: 'white', padding: '2rem' }}>
                <div style={{ padding: '2rem', background: '#ef444420', border: '1px solid #ef4444', color: '#fca5a5', borderRadius: '12px', maxWidth: '500px', textAlign: 'center' }}>
                    <h2>Error</h2>
                    <p>{error}</p>
                    <button onClick={() => navigate('/student/battle')} style={btnStyle('#3b82f6')}>← Back to Battles</button>
                </div>
            </div>
        );
    }

    if (!results) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#0f172a', color: 'white', padding: '2rem' }}>
                <p>No results available</p>
            </div>
        );
    }

    const { teamResults = [], individualResults = [], mvp } = results;
    const room = results.room || {};
    const myResult = individualResults.find(r => r.displayName === name);
    const myTeamResult = myResult?.teamId ? teamResults.find(t => t.id === myResult.teamId) : null;

    // Winner animation
    const winningTeam = teamResults[0];

    return (
        <div style={{ minHeight: '100vh', background: '#0f172a', color: 'white' }}>
            {/* Header */}
            <header style={{ padding: '1rem 2rem', background: '#1e293b', borderBottom: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Link to="/battle" style={{ color: 'white', textDecoration: 'none', fontSize: '1.25rem', fontWeight: 'bold' }}>⚔️ Team Battle</Link>
                <div style={{ fontSize: '1.5rem', fontWeight: '800', letterSpacing: '0.2rem', color: '#10b981', fontFamily: 'monospace' }}>{code}</div>
            </header>

            <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
                {/* Winner Celebration */}
                {winningTeam && (
                    <div style={{ ...cardStyle, marginBottom: '2rem', textAlign: 'center', border: `3px solid ${winningTeam.color}`, background: `${winningTeam.color}15`, animation: 'pulse 2s ease-in-out infinite' }}>
                        <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🏆</div>
                        <h2 style={{ margin: '0 0 0.5rem', fontSize: '2.5rem', color: winningTeam.color }}>
                            {winningTeam.name} Wins!
                        </h2>
                        <div style={{ fontSize: '1.5rem', color: '#fbbf24', fontWeight: 'bold' }}>
                            {winningTeam.totalScore.toLocaleString()} Points
                        </div>
                        <div style={{ marginTop: '1rem', color: '#9ca3af' }}>
                            {winningTeam.memberCount} member{winningTeam.memberCount !== 1 ? 's' : ''} · {winningTeam.members?.length || 0} participated
                        </div>
                    </div>
                )}

                {/* MVP Highlight */}
                {mvp && (
                    <div style={{ ...cardStyle, marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '2rem', flexWrap: 'wrap', border: '2px solid #fbbf24', background: '#fffbeb' }}>
                        <div style={{ fontSize: '4rem' }}>⭐</div>
                        <div>
                            <h3 style={{ margin: '0 0 0.5rem', color: '#b45309' }}>Battle MVP</h3>
                            <h2 style={{ margin: '0 0 0.25rem', color: '#92400e' }}>{mvp.displayName}</h2>
                            <p style={{ margin: 0, color: '#b45309' }}>{mvp.score.toLocaleString()} points for {mvp.teamName}</p>
                        </div>
                    </div>
                )}

                {/* Team Rankings */}
                <div style={{ marginBottom: '2rem' }}>
                    <h3 style={{ margin: '0 0 1rem', color: '#9ca3af', textTransform: 'uppercase', fontSize: '0.9rem' }}>Team Rankings</h3>
                    <div style={{ display: 'grid', gap: '1rem' }}>
                        {teamResults.map((team, index) => {
                            const isWinner = index === 0;
                            const rankIcon = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`;
                            const isMyTeam = myTeamResult?.id === team.id;
                            
                            return (
                                <div key={team.id} style={{
                                    ...cardStyle,
                                    border: `2px solid ${isWinner ? team.color : (isMyTeam ? team.color : '#334155')}`,
                                    background: isWinner ? `${team.color}15` : (isMyTeam ? `${team.color}10` : '#1e293b')
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                            <span style={{ fontSize: '2.5rem' }}>{rankIcon}</span>
                                            <div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                    <h3 style={{ margin: 0, color: isWinner ? team.color : 'white' }}>{team.name}</h3>
                                                    {isMyTeam && <span style={{ fontSize: '0.75rem', padding: '0.1rem 0.5rem', background: team.color, borderRadius: '999px', color: 'white' }}>YOUR TEAM</span>}
                                                    {isWinner && <span style={{ fontSize: '0.75rem', padding: '0.1rem 0.5rem', background: '#fbbf24', borderRadius: '999px', color: '#92400e' }}>WINNER</span>}
                                                </div>
                                                <div style={{ color: '#9ca3af', fontSize: '0.9rem', marginTop: '0.25rem' }}>
                                                    {team.memberCount} members · {team.members?.length || 0} participated
                                                </div>
                                            </div>
                                        </div>
                                        <div style={{ textAlign: 'right', minWidth: '150px' }}>
                                            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: isWinner ? team.color : '#fbbf24' }}>
                                                {team.totalScore.toLocaleString()} pts
                                            </div>
                                            <div style={{ color: '#9ca3af', fontSize: '0.85rem' }}>
                                                Avg: {team.memberCount > 0 ? Math.round(team.totalScore / team.memberCount) : 0} per member
                                            </div>
                                        </div>
                                    </div>

                                    {/* Team Members Expandable */}
                                    {team.members && team.members.length > 0 && (
                                        <TeamMemberList team={team} members={team.members} myName={name} />
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Individual Leaderboard */}
                <div style={{ marginBottom: '2rem' }}>
                    <h3 style={{ margin: '0 0 1rem', color: '#9ca3af', textTransform: 'uppercase', fontSize: '0.9rem' }}>Individual Leaderboard</h3>
                    <div style={{ ...cardStyle, overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '800px' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid #334155', color: '#9ca3af' }}>
                                    <th style={{ padding: '0.75rem', textAlign: 'left' }}>Rank</th>
                                    <th style={{ padding: '0.75rem', textAlign: 'left' }}>Player</th>
                                    <th style={{ padding: '0.75rem', textAlign: 'left' }}>Team</th>
                                    <th style={{ padding: '0.75rem', textAlign: 'right' }}>Score</th>
                                    <th style={{ padding: '0.75rem', textAlign: 'right' }}>Contribution %</th>
                                    <th style={{ padding: '0.75rem', textAlign: 'right' }}>Accuracy</th>
                                    <th style={{ padding: '0.75rem', textAlign: 'center' }}>MVP</th>
                                </tr>
                            </thead>
                            <tbody>
                                {individualResults.map((player, idx) => {
                                    const isMe = player.displayName === name;
                                    const isMVP = player.isMVP;
                                    const team = teamResults.find(t => t.id === player.teamId);
                                    return (
                                        <tr key={idx} style={{
                                            borderBottom: '1px solid #334155',
                                            background: isMe ? '#1d4ed820' : (isMVP ? '#fffbeb20' : 'transparent')
                                        }}>
                                            <td style={{ padding: '0.75rem', fontWeight: 'bold', color: idx === 0 ? '#fbbf24' : idx === 1 ? '#9ca3af' : idx === 2 ? '#b45309' : 'white' }}>
                                                {isMVP ? '⭐' : idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`}
                                            </td>
                                            <td style={{ padding: '0.75rem' }}>
                                                <span style={{ fontWeight: isMe ? 'bold' : 'normal' }}>{player.displayName}</span>
                                                {isMe && <span style={{ color: '#3b82f6', marginLeft: '0.5rem', fontSize: '0.8rem' }}>(You)</span>}
                                            </td>
                                            <td style={{ padding: '0.75rem' }}>
                                                {team && (
                                                    <span style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '0.25rem',
                                                        padding: '0.15rem 0.5rem',
                                                        background: `${team.color}30`,
                                                        border: `1px solid ${team.color}`,
                                                        borderRadius: '999px',
                                                        fontSize: '0.8rem'
                                                    }}>
                                                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: team.color }} />
                                                        {team.name}
                                                    </span>
                                                )}
                                            </td>
                                            <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 'bold', color: '#fbbf24' }}>
                                                {player.score.toLocaleString()}
                                            </td>
                                            <td style={{ padding: '0.75rem', textAlign: 'right', color: team ? team.color : '#10b981', fontWeight: 'bold' }}>
                                                {player.contributionPercent.toFixed(1)}%
                                            </td>
                                            <td style={{ padding: '0.75rem', textAlign: 'right', color: '#10b981' }}>
                                                {player.accuracyPercent?.toFixed(1) || 0}%
                                            </td>
                                            <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                                                {isMVP && <span style={{ fontSize: '1.5rem' }}>⭐</span>}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Battle Summary Stats */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
                    <StatCard label="Total Questions" value={room.totalQuestions || '?'} icon="❓" />
                    <StatCard label="Total Teams" value={teamResults.length} icon="🏷️" />
                    <StatCard label="Total Players" value={individualResults.length} icon="👥" />
                    <StatCard label="Highest Score" value={individualResults[0]?.score?.toLocaleString() || 0} icon="🏆" />
                </div>

                {/* Action Buttons */}
                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                    <Link to="/battle" style={{ ...btnStyle('#3b82f6'), display: 'inline-flex', alignItems: 'center', gap: '0.5rem', textDecoration: 'none' }}>
                        ← Back to Battles
                    </Link>
                    <button onClick={() => navigate('/')} style={btnStyle('#10b981')}>
                        🏠 Home
                    </button>
                </div>
            </main>
        </div>
    );
}

function TeamMemberList({ team, members, myName }) {
    const [expanded, setExpanded] = useState(false);

    return (
        <div>
            <button
                onClick={() => setExpanded(!expanded)}
                style={{
                    width: '100%',
                    padding: '0.75rem',
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                    color: 'white',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: '0.9rem'
                }}
            >
                <span>👥 Team Members ({members.length})</span>
                <span style={{ transition: 'transform 0.2s', transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
            </button>

            {expanded && (
                <div style={{ marginTop: '1rem', display: 'grid', gap: '0.5rem' }}>
                    {members.map((member, idx) => (
                        <div key={idx} style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '0.75rem',
                            background: '#0f172a',
                            borderRadius: '8px',
                            border: member.isMVP ? '2px solid #fbbf24' : member.displayName === myName ? '2px solid #3b82f6' : '1px solid #334155'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: idx === 0 ? '#fbbf24' : '#9ca3af' }}>
                                    #{idx + 1}
                                </span>
                                <span style={{ fontWeight: member.displayName === myName ? 'bold' : 'normal' }}>
                                    {member.displayName} {member.displayName === myName && <span style={{ color: '#3b82f6', fontSize: '0.8rem' }}>(You)</span>}
                                </span>
                                {member.isMVP && <span style={{ fontSize: '1.2rem' }}>⭐</span>}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', color: '#9ca3af', fontSize: '0.9rem' }}>
                                <span style={{ color: '#fbbf24', fontWeight: 'bold' }}>{member.score} pts</span>
                                <span style={{ color: team.color }}>({member.contributionPercent.toFixed(1)}%)</span>
                                <span>Acc: {member.accuracy?.toFixed(1) || 0}%</span>
                                <span>{member.correct || 0}/{member.attempted || 0}</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function StatCard({ label, value, icon }) {
    return (
        <div style={{
            background: '#1e293b',
            padding: '1.5rem',
            borderRadius: '12px',
            border: '1px solid #334155',
            textAlign: 'center'
        }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>{icon}</div>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#fbbf24' }}>{value}</div>
            <div style={{ color: '#9ca3af', fontSize: '0.9rem', marginTop: '0.25rem' }}>{label}</div>
        </div>
    );
}