import React, { useState, useEffect, useRef } from 'react';

/**
 * DynamicLiveLeaderboard
 * - Participating teams ranked by combined scores
 * - Rank-up and rank-down animations and indicators
 * - Expandable cards showing team members, scores, and contribution percentages
 * - Prominently highlights current user's team and leading team
 * - Shows top individual scorer (MVP)
 * - Deterministic tie-handling
 */
export default function DynamicLiveLeaderboard({
    teams = [],
    players = [],
    currentUserTeamId = null,
    currentUserName = null,
    isTeamMode = true
}) {
    const [expandedTeams, setExpandedTeams] = useState({});
    const prevRanksRef = useRef({}); // teamId/displayName -> prevRank
    const [rankChanges, setRankChanges] = useState({}); // teamId/displayName -> 'up' | 'down' | 'same'

    // Compute top individual scorer
    const sortedPlayers = [...players].sort((a, b) => (b.score || 0) - (a.score || 0) || (a.displayName || '').localeCompare(b.displayName || ''));
    const mvpPlayer = sortedPlayers.length > 0 && sortedPlayers[0].score > 0 ? sortedPlayers[0] : null;

    // Track rank changes with indicators
    useEffect(() => {
        const newRankChanges = {};
        if (isTeamMode && teams.length > 0) {
            teams.forEach((t, idx) => {
                const currentRank = idx + 1;
                const prev = prevRanksRef.current[t.id];
                if (prev !== undefined) {
                    if (currentRank < prev) newRankChanges[t.id] = 'up';
                    else if (currentRank > prev) newRankChanges[t.id] = 'down';
                    else newRankChanges[t.id] = 'same';
                }
                prevRanksRef.current[t.id] = currentRank;
            });
        } else {
            sortedPlayers.forEach((p, idx) => {
                const currentRank = idx + 1;
                const prev = prevRanksRef.current[p.displayName];
                if (prev !== undefined) {
                    if (currentRank < prev) newRankChanges[p.displayName] = 'up';
                    else if (currentRank > prev) newRankChanges[p.displayName] = 'down';
                    else newRankChanges[p.displayName] = 'same';
                }
                prevRanksRef.current[p.displayName] = currentRank;
            });
        }
        setRankChanges(newRankChanges);

        const timer = setTimeout(() => setRankChanges({}), 3000);
        return () => clearTimeout(timer);
    }, [teams, players, isTeamMode]);

    const toggleExpand = (teamId) => {
        setExpandedTeams(prev => ({ ...prev, [teamId]: !prev[teamId] }));
    };

    return (
        <div style={{ maxWidth: '650px', margin: '0 auto', width: '100%' }}>
            {/* MVP Banner */}
            {mvpPlayer && (
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '0.6rem 1rem', background: 'linear-gradient(90deg, #f59e0b22, #3b82f622)',
                    borderRadius: '8px', border: '1px solid #f59e0b66', marginBottom: '1rem'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '1.2rem' }}>🌟</span>
                        <div>
                            <span style={{ fontSize: '0.75rem', color: '#fbbf24', textTransform: 'uppercase', fontWeight: 'bold' }}>Top Scorer</span>
                            <div style={{ color: 'white', fontWeight: 'bold' }}>{mvpPlayer.displayName}</div>
                        </div>
                    </div>
                    <div style={{ color: '#fbbf24', fontWeight: 'bold', fontSize: '1.1rem' }}>
                        {mvpPlayer.score} pts
                    </div>
                </div>
            )}

            {isTeamMode ? (
                /* Team Leaderboard */
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                    {teams.map((t, idx) => {
                        const rank = idx + 1;
                        const isLeading = rank === 1;
                        const isUserTeam = currentUserTeamId === t.id;
                        const isExpanded = !!expandedTeams[t.id];
                        const change = rankChanges[t.id];
                        const members = t.members || [];

                        return (
                            <div
                                key={t.id}
                                style={{
                                    background: isUserTeam ? '#1e3a8a33' : '#1e293b',
                                    border: isUserTeam ? '2px solid #3b82f6' : isLeading ? '1px solid #fbbf24' : '1px solid #334155',
                                    borderRadius: '10px',
                                    overflow: 'hidden',
                                    boxShadow: isLeading ? '0 4px 14px rgba(251, 191, 36, 0.15)' : 'none',
                                    transition: 'transform 0.3s ease, border-color 0.3s ease'
                                }}
                            >
                                <div
                                    onClick={() => toggleExpand(t.id)}
                                    style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                        padding: '0.8rem 1rem', cursor: 'pointer',
                                        borderLeft: `5px solid ${t.color || '#3b82f6'}`
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        {/* Rank & Change Indicator */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', minWidth: '40px' }}>
                                            <span style={{
                                                fontSize: rank <= 3 ? '1.2rem' : '1rem',
                                                fontWeight: 'bold',
                                                color: rank === 1 ? '#fbbf24' : rank === 2 ? '#94a3b8' : rank === 3 ? '#c2775b' : '#64748b'
                                            }}>
                                                {rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`}
                                            </span>
                                            {change === 'up' && <span style={{ color: '#10b981', fontSize: '0.75rem', fontWeight: 'bold' }}>▲</span>}
                                            {change === 'down' && <span style={{ color: '#ef4444', fontSize: '0.75rem', fontWeight: 'bold' }}>▼</span>}
                                        </div>

                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <span style={{ fontWeight: 'bold', color: 'white', fontSize: '1.05rem' }}>
                                                    {t.name}
                                                </span>
                                                {isUserTeam && (
                                                    <span style={{ fontSize: '0.7rem', background: '#3b82f6', color: 'white', padding: '1px 6px', borderRadius: '4px', fontWeight: 'bold' }}>
                                                        Your Team
                                                    </span>
                                                )}
                                                {isLeading && (
                                                    <span style={{ fontSize: '0.7rem', background: '#fbbf2422', color: '#fbbf24', padding: '1px 6px', borderRadius: '4px', fontWeight: 'bold' }}>
                                                        Leader 👑
                                                    </span>
                                                )}
                                            </div>
                                            <span style={{ color: '#9ca3af', fontSize: '0.75rem' }}>
                                                {t.memberCount || members.length} members • Click to {isExpanded ? 'collapse' : 'view members'}
                                            </span>
                                        </div>
                                    </div>

                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ color: '#10b981', fontWeight: 'bold', fontSize: '1.15rem' }}>
                                            {t.score} pts
                                        </div>
                                        <span style={{ color: '#64748b', fontSize: '0.75rem' }}>
                                            {isExpanded ? '▲' : '▼'}
                                        </span>
                                    </div>
                                </div>

                                {/* Expanded Members List with Contribution % */}
                                {isExpanded && (
                                    <div style={{
                                        background: '#0f172a',
                                        padding: '0.75rem 1rem',
                                        borderTop: '1px solid #334155',
                                        display: 'flex', flexDirection: 'column', gap: '0.4rem'
                                    }}>
                                        {members.length === 0 ? (
                                            <div style={{ color: '#64748b', fontSize: '0.8rem', textAlign: 'center' }}>No members in this team</div>
                                        ) : (
                                            members.map((m, mIdx) => {
                                                const isUser = currentUserName && m.displayName === currentUserName;
                                                const pct = m.contributionPercent !== undefined ? m.contributionPercent : (t.score > 0 ? Math.round((m.score / t.score) * 100) : 0);

                                                return (
                                                    <div
                                                        key={mIdx}
                                                        style={{
                                                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                            padding: '0.4rem 0.6rem',
                                                            background: isUser ? '#1e3a8a44' : '#1e293b',
                                                            borderRadius: '6px',
                                                            border: isUser ? '1px solid #3b82f6' : 'none'
                                                        }}
                                                    >
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                            <span style={{ color: '#64748b', fontSize: '0.8rem' }}>#{mIdx + 1}</span>
                                                            <span style={{ color: isUser ? '#60a5fa' : 'white', fontWeight: isUser ? 'bold' : 'normal', fontSize: '0.85rem' }}>
                                                                {m.displayName} {isUser && '(You)'}
                                                            </span>
                                                        </div>

                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                                            {/* Contribution Progress Bar */}
                                                            <div style={{ width: '80px', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                                                <div style={{ flex: 1, height: '4px', background: '#334155', borderRadius: '2px', overflow: 'hidden' }}>
                                                                    <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: t.color || '#3b82f6' }} />
                                                                </div>
                                                                <span style={{ fontSize: '0.7rem', color: '#9ca3af', width: '28px', textAlign: 'right' }}>
                                                                    {pct}%
                                                                </span>
                                                            </div>

                                                            <span style={{ color: '#10b981', fontWeight: 'bold', fontSize: '0.85rem', minWidth: '45px', textAlign: 'right' }}>
                                                                {m.score} pts
                                                            </span>
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            ) : (
                /* Solo Player Leaderboard */
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    {sortedPlayers.map((p, idx) => {
                        const rank = idx + 1;
                        const isUser = currentUserName && p.displayName === currentUserName;
                        const change = rankChanges[p.displayName];

                        return (
                            <div
                                key={idx}
                                style={{
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                    padding: '0.6rem 1rem', background: isUser ? '#1d4ed822' : '#1e293b',
                                    border: isUser ? '1px solid #3b82f6' : '1px solid #334155',
                                    borderRadius: '6px',
                                    borderLeft: `4px solid ${rank === 1 ? '#fbbf24' : rank === 2 ? '#94a3b8' : rank === 3 ? '#c2775b' : '#334155'}`
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <span style={{ fontWeight: 'bold', color: rank <= 3 ? '#fbbf24' : '#64748b' }}>
                                        {rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}.`}
                                    </span>
                                    {change === 'up' && <span style={{ color: '#10b981', fontSize: '0.75rem' }}>▲</span>}
                                    {change === 'down' && <span style={{ color: '#ef4444', fontSize: '0.75rem' }}>▼</span>}
                                    <span style={{ color: isUser ? '#60a5fa' : 'white', fontWeight: isUser ? 'bold' : 'normal' }}>
                                        {p.displayName} {isUser && '(You)'}
                                    </span>
                                </div>
                                <span style={{ color: '#10b981', fontWeight: 'bold' }}>{p.score} pts</span>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

