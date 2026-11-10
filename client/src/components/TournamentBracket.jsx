import React from 'react';

/**
 * TournamentBracket — Interactive Knockout Bracket Visualizer
 * Renders rounds and matches with progression paths and winners.
 */
export default function TournamentBracket({ rounds = [], matches = [], onMatchClick = null, isHost = false }) {
    if (rounds.length === 0) {
        return (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🗂️</div>
                <p>Tournament bracket will be generated once registration closes and the organizer starts the tournament.</p>
            </div>
        );
    }

    return (
        <div style={{
            display: 'flex', gap: '2.5rem', overflowX: 'auto',
            padding: '1.5rem 0.5rem', alignItems: 'stretch'
        }}>
            {rounds.map((round) => {
                const roundMatches = matches.filter(m => m.round_id === round.id);

                return (
                    <div
                        key={round.id}
                        style={{
                            minWidth: '240px', maxWidth: '280px', flex: '1 0 240px',
                            display: 'flex', flexDirection: 'column'
                        }}
                    >
                        {/* Round Header */}
                        <div style={{
                            padding: '0.6rem 1rem', background: '#1e293b', borderRadius: '8px',
                            border: '1px solid #334155', textAlign: 'center', marginBottom: '1.5rem'
                        }}>
                            <h4 style={{ margin: 0, color: '#fbbf24', fontSize: '0.95rem' }}>{round.name}</h4>
                            <span style={{
                                fontSize: '0.7rem', textTransform: 'uppercase',
                                color: round.status === 'active' ? '#10b981' : round.status === 'completed' ? '#94a3b8' : '#64748b',
                                fontWeight: 'bold'
                            }}>
                                {round.status}
                            </span>
                        </div>

                        {/* Matches in this Round */}
                        <div style={{
                            display: 'flex', flexDirection: 'column',
                            justifyContent: 'space-around', flex: 1, gap: '1.5rem'
                        }}>
                            {roundMatches.map((match) => {
                                const isCompleted = match.status === 'completed';
                                const team1Won = match.winner_team_id && match.winner_team_id === match.team1_id;
                                const team2Won = match.winner_team_id && match.winner_team_id === match.team2_id;

                                return (
                                    <div
                                        key={match.id}
                                        onClick={() => onMatchClick && onMatchClick(match)}
                                        style={{
                                            background: '#0f172a',
                                            borderRadius: '8px',
                                            border: match.status === 'live' ? '2px solid #ef4444' : isCompleted ? '1px solid #334155' : '1px solid #1e293b',
                                            overflow: 'hidden',
                                            cursor: onMatchClick ? 'pointer' : 'default',
                                            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                                            transition: 'transform 0.15s ease'
                                        }}
                                    >
                                        <div style={{
                                            padding: '0.3rem 0.6rem', background: '#1e293b', fontSize: '0.7rem',
                                            color: '#64748b', display: 'flex', justifyContent: 'space-between'
                                        }}>
                                            <span>Match #{match.match_number}</span>
                                            {match.is_bye && <span style={{ color: '#38bdf8' }}>BYE</span>}
                                            {match.status === 'live' && <span style={{ color: '#ef4444', fontWeight: 'bold' }}>● LIVE</span>}
                                        </div>

                                        {/* Team 1 */}
                                        <div style={{
                                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                            padding: '0.5rem 0.8rem',
                                            background: team1Won ? '#10b98122' : 'transparent',
                                            borderBottom: '1px solid #1e293b',
                                            color: team1Won ? '#10b981' : match.team1_name ? 'white' : '#475569',
                                            fontWeight: team1Won ? 'bold' : 'normal',
                                            fontSize: '0.85rem'
                                        }}>
                                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {match.team1_name || 'TBD'}
                                            </span>
                                            <span style={{ fontWeight: 'bold', marginLeft: '0.5rem' }}>
                                                {isCompleted ? match.team1_score : '-'}
                                            </span>
                                        </div>

                                        {/* Team 2 */}
                                        <div style={{
                                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                            padding: '0.5rem 0.8rem',
                                            background: team2Won ? '#10b98122' : 'transparent',
                                            color: team2Won ? '#10b981' : match.team2_name ? 'white' : '#475569',
                                            fontWeight: team2Won ? 'bold' : 'normal',
                                            fontSize: '0.85rem'
                                        }}>
                                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {match.is_bye ? '(Bye Advance)' : (match.team2_name || 'TBD')}
                                            </span>
                                            <span style={{ fontWeight: 'bold', marginLeft: '0.5rem' }}>
                                                {isCompleted && !match.is_bye ? match.team2_score : '-'}
                                            </span>
                                        </div>

                                        {isHost && !isCompleted && match.team1_id && match.team2_id && (
                                            <div style={{
                                                padding: '0.4rem', background: '#1e293b', textAlign: 'center',
                                                borderTop: '1px solid #334155', color: '#38bdf8', fontSize: '0.75rem', fontWeight: 'bold'
                                            }}>
                                                ⚙️ Manage Match
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

