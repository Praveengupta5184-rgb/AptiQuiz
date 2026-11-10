import React, { useState, useEffect } from 'react';
import { api } from '../api';

const BATTLE_TYPE_LABEL = {
    quiz: '📝 Solo Quiz',
    team_battle: '⚔️ Team Battle',
};

function RankBadge({ rank, total }) {
    const color = rank === 1 ? '#fbbf24' : rank === 2 ? '#94a3b8' : rank === 3 ? '#c2775b' : '#475569';
    const icon = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;
    return (
        <span style={{
            fontWeight: 'bold', color,
            fontSize: rank <= 3 ? '1.2rem' : '0.95rem',
        }}>
            {icon}{rank > 3 ? ` / ${total}` : ''}
        </span>
    );
}

function BattleCard({ battle, onClick }) {
    const isTeam = battle.battle_type === 'team_battle';
    return (
        <div
            onClick={onClick}
            style={{
                padding: '1.1rem 1.25rem', background: '#1e293b', borderRadius: '10px',
                border: '1px solid #334155', cursor: 'pointer', transition: 'border-color 0.15s',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                flexWrap: 'wrap', gap: '1rem'
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = '#3b82f6'}
            onMouseLeave={e => e.currentTarget.style.borderColor = '#334155'}
        >
            <div style={{ flex: 1, minWidth: '180px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
                    <span style={{ fontSize: '0.75rem', color: isTeam ? '#f59e0b' : '#64748b' }}>
                        {BATTLE_TYPE_LABEL[battle.battle_type] || '📝 Quiz'}
                    </span>
                    {battle.is_mvp && (
                        <span style={{ fontSize: '0.7rem', background: '#fbbf2422', color: '#fbbf24', padding: '1px 6px', borderRadius: '999px' }}>
                            🌟 MVP
                        </span>
                    )}
                </div>
                <div style={{ fontWeight: 'bold', color: 'white', marginBottom: '0.15rem' }}>
                    {battle.battle_name || battle.test_title}
                </div>
                {battle.team_name && (
                    <div style={{ color: '#64748b', fontSize: '0.8rem' }}>Team: {battle.team_name}</div>
                )}
                <div style={{ color: '#475569', fontSize: '0.75rem' }}>
                    {new Date(battle.battle_date).toLocaleDateString('en-IN', {
                        day: 'numeric', month: 'short', year: 'numeric'
                    })}
                </div>
            </div>

            <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: '#10b981' }}>{battle.total_score}</div>
                    <div style={{ color: '#64748b', fontSize: '0.7rem' }}>Score</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                    <RankBadge rank={parseInt(battle.rank)} total={parseInt(battle.total_participants)} />
                    <div style={{ color: '#64748b', fontSize: '0.7rem', marginTop: '0.1rem' }}>Rank</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '1rem', fontWeight: 'bold', color: '#fbbf24' }}>
                        {Number(battle.accuracy_percent).toFixed(0)}%
                    </div>
                    <div style={{ color: '#64748b', fontSize: '0.7rem' }}>Accuracy</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '0.9rem', color: '#9ca3af' }}>
                        {battle.correct}/{battle.attempted}
                    </div>
                    <div style={{ color: '#64748b', fontSize: '0.7rem' }}>Correct</div>
                </div>
            </div>
        </div>
    );
}

function BattleDetailModal({ roomId, onClose }) {
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState(null);

    useEffect(() => {
        api.getBattleDetail(roomId)
            .then(d => { setData(d); setLoading(false); })
            .catch(() => setLoading(false));
    }, [roomId]);

    return (
        <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)',
            zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem'
        }}>
            <div style={{
                background: '#1e293b', borderRadius: '14px', border: '1px solid #334155',
                maxWidth: '700px', width: '100%', maxHeight: '85vh', overflowY: 'auto', padding: '1.5rem'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                    <h3 style={{ margin: 0, color: 'white' }}>
                        {loading ? 'Loading...' : (data?.room?.battle_name || data?.room?.test_title || 'Battle Detail')}
                    </h3>
                    <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '1.3rem' }}>✕</button>
                </div>

                {loading && <p style={{ color: '#64748b', textAlign: 'center' }}>Loading...</p>}

                {!loading && data && (
                    <>
                        {/* Team Standings */}
                        {data.teamStandings?.length > 0 && (
                            <div style={{ marginBottom: '1.5rem' }}>
                                <h4 style={{ color: '#fbbf24', marginBottom: '0.75rem' }}>⚔️ Team Standings</h4>
                                {data.teamStandings.map((t, i) => (
                                    <div key={t.id} style={{
                                        display: 'flex', justifyContent: 'space-between', padding: '0.6rem 1rem',
                                        background: '#0f172a', borderRadius: '6px', marginBottom: '0.4rem',
                                        borderLeft: `3px solid ${t.color || '#3b82f6'}`
                                    }}>
                                        <span style={{ color: 'white' }}>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`} {t.name}</span>
                                        <span style={{ color: '#fbbf24', fontWeight: 'bold' }}>{t.score} pts • {t.member_count} players</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Individual Leaderboard */}
                        <h4 style={{ color: '#9ca3af', marginBottom: '0.75rem' }}>📊 All Participants</h4>
                        {data.participants?.map((p, i) => (
                            <div key={i} style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                padding: '0.6rem 1rem', background: p.is_me ? '#1d4ed820' : '#0f172a',
                                border: p.is_me ? '1px solid #3b82f6' : '1px solid transparent',
                                borderRadius: '6px', marginBottom: '0.3rem'
                            }}>
                                <div>
                                    <span style={{ color: 'white', fontWeight: p.is_me ? 'bold' : 'normal' }}>
                                        {p.rank <= 3 ? (p.rank === 1 ? '🥇' : p.rank === 2 ? '🥈' : '🥉') : `#${p.rank}`} {p.display_name}
                                        {p.is_me && <span style={{ color: '#3b82f6', fontSize: '0.75rem', marginLeft: '0.4rem' }}>(you)</span>}
                                        {p.is_mvp && <span style={{ color: '#fbbf24', fontSize: '0.75rem', marginLeft: '0.4rem' }}>🌟 MVP</span>}
                                    </span>
                                    {p.team_name && <div style={{ color: '#64748b', fontSize: '0.75rem' }}>{p.team_name}</div>}
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ color: '#10b981', fontWeight: 'bold' }}>{p.total_score} pts</div>
                                    <div style={{ color: '#64748b', fontSize: '0.75rem' }}>{p.correct}/{p.attempted} correct</div>
                                </div>
                            </div>
                        ))}
                    </>
                )}
            </div>
        </div>
    );
}

export default function BattleHistoryPage() {
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(0);
    const [filterType, setFilterType] = useState('all');
    const [search, setSearch] = useState('');
    const [searchInput, setSearchInput] = useState('');
    const [selectedRoom, setSelectedRoom] = useState(null);
    const [error, setError] = useState(null);
    const LIMIT = 10;

    useEffect(() => {
        setLoading(true);
        api.getBattleHistory({ type: filterType, search, limit: LIMIT, offset: page * LIMIT })
            .then(data => {
                setHistory(data.history || []);
                setTotal(data.total || 0);
                setLoading(false);
            })
            .catch(() => {
                setError('Failed to load battle history');
                setLoading(false);
            });
    }, [filterType, search, page]);

    return (
        <div style={{ color: 'white' }}>
            <h2 style={{ margin: '0 0 1.5rem', fontSize: '1.5rem' }}>⚔️ Battle History</h2>

            {/* Filters */}
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {[['all', 'All'], ['quiz', 'Solo Quiz'], ['team_battle', 'Team Battle']].map(([val, label]) => (
                        <button key={val} onClick={() => { setFilterType(val); setPage(0); }} style={{
                            padding: '0.4rem 0.9rem', borderRadius: '999px',
                            border: `1px solid ${filterType === val ? '#3b82f6' : '#334155'}`,
                            background: filterType === val ? '#3b82f6' : 'transparent',
                            color: filterType === val ? 'white' : '#9ca3af',
                            cursor: 'pointer', fontSize: '0.85rem'
                        }}>{label}</button>
                    ))}
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', flex: 1, minWidth: '200px' }}>
                    <input
                        type="text"
                        placeholder="Search battles..."
                        value={searchInput}
                        onChange={e => setSearchInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { setSearch(searchInput); setPage(0); } }}
                        style={{ flex: 1, padding: '0.4rem 0.75rem', background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', color: 'white', fontSize: '0.85rem' }}
                    />
                    <button onClick={() => { setSearch(searchInput); setPage(0); }} style={{
                        padding: '0.4rem 0.9rem', background: '#3b82f6', border: 'none', borderRadius: '6px', color: 'white', cursor: 'pointer'
                    }}>🔍</button>
                </div>
            </div>

            {/* Content */}
            {loading ? (
                <div style={{ textAlign: 'center', color: '#64748b', padding: '3rem' }}>Loading...</div>
            ) : error ? (
                <div style={{ textAlign: 'center', color: '#ef4444', padding: '2rem' }}>{error}</div>
            ) : history.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#475569', padding: '3rem' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>📭</div>
                    <p>No battles found. Join a quiz or team battle to get started!</p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {history.map(battle => (
                        <BattleCard
                            key={`${battle.room_id}`}
                            battle={battle}
                            onClick={() => setSelectedRoom(battle.room_id)}
                        />
                    ))}
                </div>
            )}

            {/* Pagination */}
            {total > LIMIT && (
                <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '1.5rem' }}>
                    <button disabled={page === 0} onClick={() => setPage(p => p - 1)} style={{ padding: '0.4rem 0.9rem', background: page === 0 ? '#1e293b' : '#3b82f6', border: 'none', borderRadius: '6px', color: page === 0 ? '#475569' : 'white', cursor: page === 0 ? 'not-allowed' : 'pointer' }}>
                        ← Prev
                    </button>
                    <span style={{ color: '#64748b', alignSelf: 'center' }}>
                        Page {page + 1} of {Math.ceil(total / LIMIT)}
                    </span>
                    <button disabled={(page + 1) * LIMIT >= total} onClick={() => setPage(p => p + 1)} style={{ padding: '0.4rem 0.9rem', background: (page + 1) * LIMIT >= total ? '#1e293b' : '#3b82f6', border: 'none', borderRadius: '6px', color: (page + 1) * LIMIT >= total ? '#475569' : 'white', cursor: (page + 1) * LIMIT >= total ? 'not-allowed' : 'pointer' }}>
                        Next →
                    </button>
                </div>
            )}

            {selectedRoom && (
                <BattleDetailModal roomId={selectedRoom} onClose={() => setSelectedRoom(null)} />
            )}
        </div>
    );
}

