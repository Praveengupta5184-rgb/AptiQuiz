import React, { useState, useEffect } from 'react';
import { api } from '../api';

export default function AntiCheatDashboard() {
    const [stats, setStats] = useState(null);
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filterRisk, setFilterRisk] = useState('');
    const [filterReviewed, setFilterReviewed] = useState('');
    const [selectedLog, setSelectedLog] = useState(null);
    const [reviewNote, setReviewNote] = useState('');
    const [action, setAction] = useState('cleared');
    const [submitting, setSubmitting] = useState(false);

    const isSuperAdmin = localStorage.getItem('teacherRole') === 'super_admin';

    const loadData = () => {
        setLoading(true);
        api.getSuspiciousActivity({
            riskLevel: filterRisk || undefined,
            reviewed: filterReviewed !== '' ? filterReviewed : undefined
        })
            .then(data => {
                setLogs(data.logs || []);
                setStats(data.stats || null);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    };

    useEffect(() => {
        loadData();
    }, [filterRisk, filterReviewed]);

    const handleResolve = async (e) => {
        e.preventDefault();
        if (!selectedLog) return;
        setSubmitting(true);
        try {
            await api.reviewSuspiciousActivity(selectedLog.id, {
                note: reviewNote,
                resolutionAction: action
            });
            setSelectedLog(null);
            setReviewNote('');
            loadData();
        } catch (err) {
            alert(err.message || 'Failed to submit review');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div style={{ color: 'white', maxWidth: '1200px', margin: '0 auto', padding: '1rem' }}>
            <div style={{ marginBottom: '2rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
                    <span style={{ fontSize: '1.8rem' }}>🛡️</span>
                    <h1 style={{ margin: 0, fontSize: '1.8rem' }}>
                        {isSuperAdmin ? 'Platform Anti-Cheat & Moderation' : 'Battle Anti-Cheat Monitor'}
                    </h1>
                </div>
                <p style={{ color: '#94a3af', margin: 0 }}>
                    {isSuperAdmin
                        ? 'Platform-wide security monitoring queue and organizer oversight.'
                        : 'Real-time telemetry and suspicious activity flags isolated for your own battles and tournaments.'}
                </p>
            </div>

            {/* Metrics Cards */}
            {stats && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
                    <div style={{ background: '#1e293b', padding: '1.25rem', borderRadius: '10px', border: '1px solid #334155' }}>
                        <div style={{ color: '#94a3af', fontSize: '0.8rem', textTransform: 'uppercase' }}>Total Flagged Events</div>
                        <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: 'white', marginTop: '0.2rem' }}>{stats.total_flagged || 0}</div>
                    </div>
                    <div style={{ background: '#1e293b', padding: '1.25rem', borderRadius: '10px', border: '1px solid #ef4444' }}>
                        <div style={{ color: '#fca5a5', fontSize: '0.8rem', textTransform: 'uppercase' }}>Critical High-Risk (8+)</div>
                        <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#ef4444', marginTop: '0.2rem' }}>{stats.critical_risk_count || 0}</div>
                    </div>
                    <div style={{ background: '#1e293b', padding: '1.25rem', borderRadius: '10px', border: '1px solid #f59e0b' }}>
                        <div style={{ color: '#fcd34d', fontSize: '0.8rem', textTransform: 'uppercase' }}>Pending Review</div>
                        <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#fbbf24', marginTop: '0.2rem' }}>{stats.pending_reviews || 0}</div>
                    </div>
                    <div style={{ background: '#1e293b', padding: '1.25rem', borderRadius: '10px', border: '1px solid #10b981' }}>
                        <div style={{ color: '#6ee7b7', fontSize: '0.8rem', textTransform: 'uppercase' }}>Resolved / Cleared</div>
                        <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#10b981', marginTop: '0.2rem' }}>{stats.resolved_reviews || 0}</div>
                    </div>
                </div>
            )}

            {/* Filter Bar */}
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <span style={{ color: '#94a3af', fontSize: '0.85rem' }}>Risk Level:</span>
                    <select
                        value={filterRisk}
                        onChange={e => setFilterRisk(e.target.value)}
                        style={{ padding: '0.4rem 0.8rem', background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', color: 'white', fontSize: '0.85rem' }}
                    >
                        <option value="">All Risks</option>
                        <option value="critical">Critical (8+)</option>
                        <option value="high">High (5-7)</option>
                        <option value="medium">Medium (3-4)</option>
                        <option value="low">Low (1-2)</option>
                    </select>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <span style={{ color: '#94a3af', fontSize: '0.85rem' }}>Status:</span>
                    <select
                        value={filterReviewed}
                        onChange={e => setFilterReviewed(e.target.value)}
                        style={{ padding: '0.4rem 0.8rem', background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', color: 'white', fontSize: '0.85rem' }}
                    >
                        <option value="">All Statuses</option>
                        <option value="false">Pending Only</option>
                        <option value="true">Resolved Only</option>
                    </select>
                </div>
            </div>

            {/* Suspicious Activity Table */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>Loading monitoring telemetry...</div>
            ) : logs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3.5rem', background: '#1e293b', borderRadius: '12px' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>🛡️</div>
                    <h3 style={{ margin: 0, color: '#10b981' }}>Clean Monitoring Queue</h3>
                    <p style={{ color: '#94a3af', margin: '0.5rem 0 0' }}>No suspicious activity events match the current filter criteria.</p>
                </div>
            ) : (
                <div style={{ background: '#1e293b', borderRadius: '12px', border: '1px solid #334155', overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid #334155', background: '#0f172a', color: '#94a3af' }}>
                                <th style={{ padding: '0.8rem 1rem' }}>Risk</th>
                                <th style={{ padding: '0.8rem 1rem' }}>Player</th>
                                <th style={{ padding: '0.8rem 1rem' }}>Event Type</th>
                                <th style={{ padding: '0.8rem 1rem' }}>Battle / Tournament</th>
                                <th style={{ padding: '0.8rem 1rem' }}>Timestamp</th>
                                <th style={{ padding: '0.8rem 1rem' }}>Status</th>
                                <th style={{ padding: '0.8rem 1rem', textAlign: 'right' }}>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {logs.map(log => {
                                const isCritical = log.risk_score >= 8;
                                const isHigh = log.risk_score >= 5 && log.risk_score < 8;

                                return (
                                    <tr key={log.id} style={{ borderBottom: '1px solid #334155', background: log.reviewed ? 'transparent' : 'rgba(239, 68, 68, 0.05)' }}>
                                        <td style={{ padding: '0.8rem 1rem' }}>
                                            <span style={{
                                                padding: '2px 8px', borderRadius: '4px', fontWeight: 'bold', fontSize: '0.75rem',
                                                background: isCritical ? '#ef4444' : isHigh ? '#f59e0b' : '#334155',
                                                color: 'white'
                                            }}>
                                                Score {log.risk_score}
                                            </span>
                                        </td>
                                        <td style={{ padding: '0.8rem 1rem' }}>
                                            <div style={{ fontWeight: 'bold' }}>{log.student_name || 'Anonymous Student'}</div>
                                            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{log.student_email || ''}</div>
                                        </td>
                                        <td style={{ padding: '0.8rem 1rem', fontFamily: 'monospace', color: '#38bdf8' }}>
                                            {log.event_type}
                                        </td>
                                        <td style={{ padding: '0.8rem 1rem' }}>
                                            <div>{log.battle_name || log.tournament_name || (log.room_code ? `Room ${log.room_code}` : 'General')}</div>
                                        </td>
                                        <td style={{ padding: '0.8rem 1rem', color: '#94a3af', fontSize: '0.8rem' }}>
                                            {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </td>
                                        <td style={{ padding: '0.8rem 1rem' }}>
                                            <span style={{
                                                fontSize: '0.75rem', padding: '2px 8px', borderRadius: '999px',
                                                background: log.reviewed ? '#10b98122' : '#f59e0b22',
                                                color: log.reviewed ? '#10b981' : '#fbbf24', fontWeight: 'bold'
                                            }}>
                                                {log.reviewed ? `Reviewed (${log.resolution_action})` : 'Pending'}
                                            </span>
                                        </td>
                                        <td style={{ padding: '0.8rem 1rem', textAlign: 'right' }}>
                                            <button
                                                onClick={() => {
                                                    setSelectedLog(log);
                                                    setReviewNote(log.review_note || '');
                                                    setAction(log.resolution_action || 'cleared');
                                                }}
                                                style={{
                                                    padding: '0.35rem 0.8rem', background: '#3b82f6', border: 'none',
                                                    borderRadius: '4px', color: 'white', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold'
                                                }}
                                            >
                                                Investigate
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Investigation & Moderation Modal */}
            {selectedLog && (
                <div style={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 9999,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem'
                }}>
                    <div style={{ background: '#1e293b', borderRadius: '12px', border: '1px solid #334155', padding: '1.5rem', maxWidth: '500px', width: '100%' }}>
                        <h3 style={{ margin: '0 0 0.5rem' }}>Investigate Suspicious Activity</h3>
                        <p style={{ color: '#9ca3af', fontSize: '0.85rem', margin: '0 0 1rem' }}>
                            Player: <strong style={{ color: 'white' }}>{selectedLog.student_name}</strong> • Event: <span style={{ color: '#38bdf8' }}>{selectedLog.event_type}</span>
                        </p>

                        <div style={{ background: '#0f172a', padding: '0.8rem', borderRadius: '6px', fontSize: '0.8rem', fontFamily: 'monospace', color: '#cbd5e1', marginBottom: '1rem', maxHeight: '140px', overflowY: 'auto' }}>
                            {JSON.stringify(selectedLog.details, null, 2)}
                        </div>

                        <form onSubmit={handleResolve}>
                            <div style={{ marginBottom: '1rem' }}>
                                <label style={{ display: 'block', color: '#9ca3af', fontSize: '0.85rem', marginBottom: '0.3rem' }}>Action to Apply:</label>
                                <select
                                    value={action}
                                    onChange={e => setAction(e.target.value)}
                                    style={{ width: '100%', padding: '0.5rem', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: 'white' }}
                                >
                                    <option value="cleared">Clear (False Positive / Network Jitter)</option>
                                    <option value="warning">Issue Official In-Game Warning</option>
                                    <option value="penalized">Deduct Points / Restrict Powerups</option>
                                    <option value="restricted">Restrict From Current Battle</option>
                                </select>
                            </div>

                            <div style={{ marginBottom: '1.5rem' }}>
                                <label style={{ display: 'block', color: '#9ca3af', fontSize: '0.85rem', marginBottom: '0.3rem' }}>Moderation Note:</label>
                                <textarea
                                    rows="3"
                                    required
                                    placeholder="Explain why this resolution was chosen..."
                                    value={reviewNote}
                                    onChange={e => setReviewNote(e.target.value)}
                                    style={{ width: '100%', padding: '0.5rem', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: 'white', boxSizing: 'border-box' }}
                                />
                            </div>

                            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                <button
                                    type="button"
                                    onClick={() => setSelectedLog(null)}
                                    style={{ padding: '0.5rem 1rem', background: 'transparent', border: '1px solid #475569', color: '#9ca3af', borderRadius: '6px', cursor: 'pointer' }}
                                >
                                    Close
                                </button>
                                <button
                                    type="submit"
                                    disabled={submitting}
                                    style={{ padding: '0.5rem 1.2rem', background: '#10b981', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}
                                >
                                    {submitting ? 'Saving...' : 'Apply Resolution'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

