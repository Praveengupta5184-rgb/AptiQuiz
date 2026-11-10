import React, { useEffect, useState } from 'react';
import { api } from '../api';

const CATEGORY_COLORS = {
    milestone: '#3b82f6',
    performance: '#f59e0b',
    social: '#10b981',
    general: '#8b5cf6',
};

function AchievementCard({ achievement, earned, earnedAt, isNew }) {
    const catColor = CATEGORY_COLORS[achievement.category] || '#8b5cf6';
    return (
        <div style={{
            padding: '1.25rem',
            background: earned ? '#1e293b' : '#0f172a',
            border: `1px solid ${earned ? catColor : '#1e293b'}`,
            borderRadius: '10px',
            opacity: earned ? 1 : 0.5,
            position: 'relative',
            transition: 'all 0.2s',
        }}>
            {isNew && earned && (
                <div style={{
                    position: 'absolute', top: '-6px', right: '-6px',
                    background: '#ef4444', color: 'white', fontSize: '0.65rem',
                    padding: '2px 7px', borderRadius: '999px', fontWeight: 'bold'
                }}>NEW!</div>
            )}
            <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem', textAlign: 'center' }}>
                {achievement.icon}
            </div>
            <h4 style={{
                margin: '0 0 0.25rem', color: earned ? 'white' : '#475569',
                textAlign: 'center', fontSize: '0.95rem'
            }}>
                {achievement.name}
            </h4>
            <p style={{ margin: 0, color: '#64748b', fontSize: '0.78rem', textAlign: 'center' }}>
                {achievement.description}
            </p>
            <div style={{ marginTop: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{
                    fontSize: '0.7rem', padding: '2px 8px', borderRadius: '999px',
                    background: catColor + '22', color: catColor, fontWeight: 'bold'
                }}>
                    {achievement.category}
                </span>
                <span style={{ color: '#fbbf24', fontSize: '0.8rem', fontWeight: 'bold' }}>
                    +{achievement.xp_reward} XP
                </span>
            </div>
            {earned && earnedAt && (
                <div style={{ marginTop: '0.5rem', textAlign: 'center', color: '#475569', fontSize: '0.72rem' }}>
                    Earned {new Date(earnedAt).toLocaleDateString()}
                </div>
            )}
        </div>
    );
}

function XPLevelBar({ xp }) {
    const level = Math.floor(1 + Math.sqrt(xp / 100));
    const xpForCurrentLevel = Math.pow(level - 1, 2) * 100;
    const xpForNextLevel = Math.pow(level, 2) * 100;
    const progress = Math.min(100, ((xp - xpForCurrentLevel) / (xpForNextLevel - xpForCurrentLevel)) * 100);

    return (
        <div style={{ marginBottom: '1.5rem', padding: '1.25rem', background: '#1e293b', borderRadius: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ color: '#fbbf24', fontWeight: 'bold', fontSize: '1.1rem' }}>
                    ⭐ Level {level}
                </span>
                <span style={{ color: '#9ca3af', fontSize: '0.85rem' }}>
                    {xp} XP total
                </span>
            </div>
            <div style={{ background: '#0f172a', borderRadius: '999px', height: '8px', overflow: 'hidden' }}>
                <div style={{
                    width: `${progress}%`, height: '100%',
                    background: 'linear-gradient(90deg, #fbbf24, #f59e0b)',
                    borderRadius: '999px', transition: 'width 0.5s ease'
                }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.3rem' }}>
                <span style={{ color: '#475569', fontSize: '0.72rem' }}>{xpForCurrentLevel} XP</span>
                <span style={{ color: '#475569', fontSize: '0.72rem' }}>Next: {xpForNextLevel} XP</span>
            </div>
        </div>
    );
}

export default function AchievementGallery() {
    const [loading, setLoading] = useState(true);
    const [myAchievements, setMyAchievements] = useState([]);
    const [profile, setProfile] = useState(null);
    const [allDefinitions, setAllDefinitions] = useState([]);
    const [filter, setFilter] = useState('all'); // all | earned | category
    const [error, setError] = useState(null);

    useEffect(() => {
        Promise.all([api.getMyAchievements(), api.getAllAchievementDefinitions()])
            .then(([myData, allData]) => {
                setMyAchievements(myData.achievements || []);
                setProfile(myData.profile);
                setAllDefinitions(allData.achievements || []);
                setLoading(false);

                // Mark as seen
                if (myData.achievements?.some(a => a.is_new)) {
                    api.markAchievementsSeen().catch(() => {});
                }
            })
            .catch(e => {
                setError('Failed to load achievements');
                setLoading(false);
            });
    }, []);

    const earnedMap = new Map(myAchievements.map(a => [a.achievement_id, a]));
    const categories = ['all', 'earned', ...new Set(allDefinitions.map(d => d.category))];

    const displayedAchievements = allDefinitions.filter(def => {
        if (filter === 'earned') return earnedMap.has(def.id);
        if (filter === 'all') return true;
        return def.category === filter;
    });

    const earnedCount = allDefinitions.filter(d => earnedMap.has(d.id)).length;

    if (loading) return (
        <div style={{ padding: '2rem', color: '#9ca3af', textAlign: 'center' }}>
            Loading achievements...
        </div>
    );

    if (error) return (
        <div style={{ padding: '2rem', color: '#ef4444', textAlign: 'center' }}>{error}</div>
    );

    return (
        <div style={{ color: 'white' }}>
            <h2 style={{ margin: '0 0 1.5rem', fontSize: '1.5rem' }}>🏅 Achievements & Badges</h2>

            {/* XP Level Bar */}
            {profile && <XPLevelBar xp={profile.total_xp || 0} />}

            {/* Stats Row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                {[
                    { label: 'Badges Earned', value: `${earnedCount}/${allDefinitions.length}`, icon: '🏅' },
                    { label: 'Battles Played', value: profile?.battles_played || 0, icon: '⚔️' },
                    { label: 'Battles Won', value: profile?.battles_won || 0, icon: '🏆' },
                    { label: 'MVP Count', value: profile?.mvp_count || 0, icon: '🌟' },
                ].map(stat => (
                    <div key={stat.label} style={{ background: '#1e293b', borderRadius: '8px', padding: '1rem', textAlign: 'center' }}>
                        <div style={{ fontSize: '1.5rem' }}>{stat.icon}</div>
                        <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: '#fbbf24' }}>{stat.value}</div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.2rem' }}>{stat.label}</div>
                    </div>
                ))}
            </div>

            {/* Filter Tabs */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                {categories.map(cat => (
                    <button
                        key={cat}
                        onClick={() => setFilter(cat)}
                        style={{
                            padding: '0.4rem 0.9rem', borderRadius: '999px',
                            border: `1px solid ${filter === cat ? '#3b82f6' : '#334155'}`,
                            background: filter === cat ? '#3b82f6' : 'transparent',
                            color: filter === cat ? 'white' : '#9ca3af',
                            cursor: 'pointer', fontSize: '0.85rem', textTransform: 'capitalize'
                        }}
                    >
                        {cat === 'earned' ? `✅ Earned (${earnedCount})` : cat}
                    </button>
                ))}
            </div>

            {/* Achievement Grid */}
            {displayedAchievements.length === 0 ? (
                <div style={{ padding: '3rem', textAlign: 'center', color: '#475569' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>🎯</div>
                    <p>No achievements here yet. Keep playing to unlock badges!</p>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1rem' }}>
                    {displayedAchievements.map(def => {
                        const earned = earnedMap.get(def.id);
                        return (
                            <AchievementCard
                                key={def.id}
                                achievement={def}
                                earned={!!earned}
                                earnedAt={earned?.earned_at}
                                isNew={earned?.is_new}
                            />
                        );
                    })}
                </div>
            )}
        </div>
    );
}

