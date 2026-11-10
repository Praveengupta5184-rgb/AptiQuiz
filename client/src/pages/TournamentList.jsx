import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';

export default function TournamentList() {
    const navigate = useNavigate();
    const [tournaments, setTournaments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('');

    useEffect(() => {
        setLoading(true);
        api.getTournaments(filter)
            .then(data => {
                setTournaments(data.tournaments || []);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, [filter]);

    return (
        <div style={{ color: 'white', maxWidth: '1000px', margin: '0 auto', padding: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h1 style={{ margin: '0 0 0.5rem', fontSize: '1.8rem' }}>🏆 Tournaments</h1>
                    <p style={{ color: '#94a3af', margin: 0 }}>Compete in multiplayer tournament brackets and win badges & trophies!</p>
                </div>
            </div>

            {/* Filter Tabs */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
                {[['', 'All Tournaments'], ['registration', 'Open for Registration'], ['in_progress', 'Live & Ongoing'], ['completed', 'Finished']].map(([val, label]) => (
                    <button
                        key={val}
                        onClick={() => setFilter(val)}
                        style={{
                            padding: '0.4rem 0.9rem', borderRadius: '999px',
                            border: `1px solid ${filter === val ? '#3b82f6' : '#334155'}`,
                            background: filter === val ? '#3b82f6' : 'transparent',
                            color: filter === val ? 'white' : '#9ca3af',
                            cursor: 'pointer', fontSize: '0.85rem'
                        }}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>Loading tournaments...</div>
            ) : tournaments.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: '#64748b', background: '#1e293b', borderRadius: '12px' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>🏆</div>
                    <p>No tournaments found matching this status.</p>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.25rem' }}>
                    {tournaments.map(t => (
                        <div
                            key={t.id}
                            onClick={() => navigate(`/tournament/${t.id}`)}
                            style={{
                                background: '#1e293b', borderRadius: '12px', padding: '1.5rem',
                                border: '1px solid #334155', cursor: 'pointer',
                                transition: 'all 0.2s', display: 'flex', flexDirection: 'column', justifyContent: 'space-between'
                            }}
                            onMouseEnter={e => e.currentTarget.style.borderColor = '#3b82f6'}
                            onMouseLeave={e => e.currentTarget.style.borderColor = '#334155'}
                        >
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                    <span style={{
                                        fontSize: '0.7rem', padding: '2px 8px', borderRadius: '999px', fontWeight: 'bold',
                                        background: t.status === 'in_progress' ? '#10b98122' : t.status === 'completed' ? '#fbbf2422' : '#3b82f622',
                                        color: t.status === 'in_progress' ? '#10b981' : t.status === 'completed' ? '#fbbf24' : '#3b82f6',
                                        textTransform: 'uppercase'
                                    }}>
                                        {t.status.replace('_', ' ')}
                                    </span>
                                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{t.category}</span>
                                </div>
                                <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.2rem', color: 'white' }}>{t.name}</h3>
                                <p style={{ color: '#94a3af', fontSize: '0.85rem', margin: '0 0 1rem', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                    {t.description || 'Knockout aptitude tournament.'}
                                </p>
                            </div>

                            <div style={{ borderTop: '1px solid #334155', paddingTop: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ color: '#cbd5e1', fontSize: '0.8rem' }}>
                                    👥 {t.registered_teams || 0} / {t.max_teams} Teams
                                </span>
                                <span style={{ color: '#38bdf8', fontSize: '0.85rem', fontWeight: 'bold' }}>
                                    View Tournament →
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

