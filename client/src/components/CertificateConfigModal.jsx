import React, { useState, useEffect } from 'react';
import { api } from '../api';

export default function CertificateConfigModal({ roomId = null, roomCode = null, tournamentId = null, eventName = '', onClose = null, onIssued = null }) {
    const [config, setConfig] = useState({
        isEnabled: true,
        topTeamsCount: 3,
        topIndividualsCount: 3,
        title: 'Certificate of Excellence',
        description: 'For outstanding aptitude and performance in AptiQuiz battle.',
        styleTheme: 'gold',
        organizerName: localStorage.getItem('teacherName') || 'Quiz Master',
        organizerDesignation: 'Lead Evaluator / Organizer',
        institutionName: '',
        issueDate: new Date().toISOString().split('T')[0]
    });
    const [loading, setLoading] = useState(true);
    const [issuing, setIssuing] = useState(false);
    const [statusMsg, setStatusMsg] = useState(null);

    useEffect(() => {
        api.getCertificateConfig(roomId, tournamentId, roomCode)
            .then(data => {
                if (data.config) {
                    setConfig({
                        isEnabled: data.config.is_enabled,
                        topTeamsCount: data.config.top_teams_count,
                        topIndividualsCount: data.config.top_individuals_count,
                        title: data.config.title,
                        description: data.config.description,
                        styleTheme: data.config.style_theme,
                        organizerName: data.config.organizer_name,
                        organizerDesignation: data.config.organizer_designation,
                        institutionName: data.config.institution_name || '',
                        issueDate: data.config.issue_date?.split('T')[0] || new Date().toISOString().split('T')[0]
                    });
                }
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, [roomId, tournamentId, roomCode]);

    const handleSaveAndIssue = async (e) => {
        e.preventDefault();
        setIssuing(true);
        setStatusMsg(null);
        try {
            const cleanRoomId = (roomId && !isNaN(parseInt(roomId))) ? parseInt(roomId) : undefined;
            const cleanTourneyId = (tournamentId && !isNaN(parseInt(tournamentId))) ? parseInt(tournamentId) : undefined;
            const cleanRoomCode = roomCode ? String(roomCode).trim().toUpperCase() : undefined;

            // 1. Save Config
            await api.saveCertificateConfig({
                roomId: cleanRoomId,
                roomCode: cleanRoomCode,
                tournamentId: cleanTourneyId,
                ...config
            });

            // 2. Issue Certificates automatically to eligible teams and individuals
            const res = await api.issueCertificates({
                roomId: cleanRoomId,
                roomCode: cleanRoomCode,
                tournamentId: cleanTourneyId
            });

            const issuedCount = res.count ?? (res.certificates?.length || 0);
            const msg = issuedCount > 0 
                ? `🎉 Success! ${issuedCount} digital certificate(s) issued with QR verification.` 
                : '✅ Certificates processed! (Eligible participants have already been issued their certificates).';
            setStatusMsg({ type: 'success', text: msg });
            if (onIssued) onIssued(res);
            setTimeout(() => {
                if (onClose) onClose();
            }, 2500);
        } catch (err) {
            setStatusMsg({ type: 'error', text: err.message || 'Failed to issue certificates' });
        } finally {
            setIssuing(false);
        }
    };

    return (
        <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(4px)',
            zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem'
        }}>
            <div style={{ background: '#1e293b', borderRadius: '14px', border: '1px solid #334155', maxWidth: '580px', width: '100%', padding: '2rem', maxHeight: '90vh', overflowY: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.4rem', color: 'white' }}>📜 Configure & Issue Certificates</h2>
                        <span style={{ fontSize: '0.85rem', color: '#94a3af' }}>{eventName}</span>
                    </div>
                    {onClose && (
                        <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#94a3af', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
                    )}
                </div>

                {statusMsg && (
                    <div style={{
                        padding: '0.8rem 1rem', borderRadius: '6px', marginBottom: '1.2rem',
                        background: statusMsg.type === 'success' ? '#10b98122' : '#ef444422',
                        border: `1px solid ${statusMsg.type === 'success' ? '#10b981' : '#ef4444'}`,
                        color: statusMsg.type === 'success' ? '#10b981' : '#fca5a5'
                    }}>
                        {statusMsg.text}
                    </div>
                )}

                <form onSubmit={handleSaveAndIssue}>
                    {/* Top Ranks Criteria */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.2rem' }}>
                        <div>
                            <label style={{ display: 'block', color: '#9ca3af', fontSize: '0.85rem', marginBottom: '0.3rem' }}>
                                Top Teams Receiving Certs:
                            </label>
                            <input
                                type="number"
                                min="0"
                                max="50"
                                value={config.topTeamsCount}
                                onChange={e => setConfig({ ...config, topTeamsCount: parseInt(e.target.value) || 0 })}
                                style={{ width: '100%', padding: '0.5rem', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: 'white' }}
                            />
                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Every team member gets a copy</span>
                        </div>
                        <div>
                            <label style={{ display: 'block', color: '#9ca3af', fontSize: '0.85rem', marginBottom: '0.3rem' }}>
                                Top Individuals Receiving Certs:
                            </label>
                            <input
                                type="number"
                                min="0"
                                max="50"
                                value={config.topIndividualsCount}
                                onChange={e => setConfig({ ...config, topIndividualsCount: parseInt(e.target.value) || 0 })}
                                style={{ width: '100%', padding: '0.5rem', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: 'white' }}
                            />
                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Individual rank distinction</span>
                        </div>
                    </div>

                    {/* Certificate Style Theme */}
                    <div style={{ marginBottom: '1.2rem' }}>
                        <label style={{ display: 'block', color: '#9ca3af', fontSize: '0.85rem', marginBottom: '0.3rem' }}>
                            Visual Theme Style:
                        </label>
                        <div style={{ display: 'flex', gap: '1rem' }}>
                            {[
                                { id: 'gold', name: '👑 Royal Gold', border: '#fbbf24' },
                                { id: 'blue', name: '💎 Tech Azure', border: '#38bdf8' },
                                { id: 'academic', name: '🏛️ Classic Academic', border: '#94a3b8' }
                            ].map(t => (
                                <label key={t.id} style={{
                                    flex: 1, padding: '0.6rem', borderRadius: '6px', border: `1px solid ${config.styleTheme === t.id ? t.border : '#334155'}`,
                                    background: config.styleTheme === t.id ? '#0f172a' : 'transparent', cursor: 'pointer', textAlign: 'center', fontSize: '0.8rem', color: 'white'
                                }}>
                                    <input
                                        type="radio"
                                        name="styleTheme"
                                        checked={config.styleTheme === t.id}
                                        onChange={() => setConfig({ ...config, styleTheme: t.id })}
                                        style={{ display: 'none' }}
                                    />
                                    {t.name}
                                </label>
                            ))}
                        </div>
                    </div>

                    {/* Title & Description */}
                    <div style={{ marginBottom: '1rem' }}>
                        <label style={{ display: 'block', color: '#9ca3af', fontSize: '0.85rem', marginBottom: '0.3rem' }}>Certificate Title:</label>
                        <input
                            type="text"
                            required
                            value={config.title}
                            onChange={e => setConfig({ ...config, title: e.target.value })}
                            style={{ width: '100%', padding: '0.5rem', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: 'white' }}
                        />
                    </div>

                    {/* Organizer & Institution */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                        <div>
                            <label style={{ display: 'block', color: '#9ca3af', fontSize: '0.85rem', marginBottom: '0.3rem' }}>Issuer / Organizer Name:</label>
                            <input
                                type="text"
                                required
                                value={config.organizerName}
                                onChange={e => setConfig({ ...config, organizerName: e.target.value })}
                                style={{ width: '100%', padding: '0.5rem', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: 'white' }}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', color: '#9ca3af', fontSize: '0.85rem', marginBottom: '0.3rem' }}>Institution / College Name:</label>
                            <input
                                type="text"
                                placeholder="Optional"
                                value={config.institutionName}
                                onChange={e => setConfig({ ...config, institutionName: e.target.value })}
                                style={{ width: '100%', padding: '0.5rem', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: 'white' }}
                            />
                        </div>
                    </div>

                    {/* Buttons */}
                    <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.5rem', borderTop: '1px solid #334155', paddingTop: '1.2rem' }}>
                        {onClose && (
                            <button
                                type="button"
                                onClick={onClose}
                                style={{ padding: '0.6rem 1.2rem', background: 'transparent', border: '1px solid #475569', color: '#9ca3af', borderRadius: '6px', cursor: 'pointer' }}
                            >
                                Cancel
                            </button>
                        )}
                        <button
                            type="submit"
                            disabled={issuing}
                            style={{
                                padding: '0.6rem 1.5rem', background: '#fbbf24', color: '#0f172a',
                                border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: '0.5rem'
                            }}
                        >
                            {issuing ? 'Generating QR Certificates...' : '🏆 Issue Verified Certificates'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

