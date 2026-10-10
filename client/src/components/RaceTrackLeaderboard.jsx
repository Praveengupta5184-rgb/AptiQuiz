import React from 'react';
import './RaceTrack.css';

/**
 * Renders a visual "Race Track" where players move left-to-right based on score relative to the leader.
 */
export default function RaceTrackLeaderboard({ leaderboard, maxPlayers = 10 }) {
    if (!leaderboard || leaderboard.length === 0) return null;

    // The top score dictates the finish line scaling
    const maxScore = Math.max(1, leaderboard[0].score);

    // Show only top N players for the track to avoid clutter
    const visiblePlayers = leaderboard.slice(0, maxPlayers);

    return (
        <div className="race-track-container" aria-label="Live Leaderboard Race Track">
            <h3 className="track-title">Live Positions</h3>
            <div className="track">
                {visiblePlayers.map((player, index) => {
                    const progressPercent = (player.score / maxScore) * 100;
                    // Highlight the first place in gold, second in silver, etc.
                    const rankClass = index === 0 ? 'rank-1' : index === 1 ? 'rank-2' : index === 2 ? 'rank-3' : 'rank-other';
                    
                    return (
                        <div key={player.displayName} className="track-lane">
                            <div className="lane-label">
                                <span className="rank-num">#{index + 1}</span> {player.displayName}
                            </div>
                            <div className="lane-bar-container">
                                <div 
                                    className={`lane-bar ${rankClass}`} 
                                    style={{ width: `${Math.max(2, progressPercent)}%` }}
                                >
                                    <span className="lane-score">{player.score}</span>
                                    {player.streak >= 3 && <span className="streak-fire" title="On Fire!">🔥</span>}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
