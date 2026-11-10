import React, { useState, useEffect } from 'react';
import { api } from '../api';
import CertificateView from '../components/CertificateView';

export default function StudentCertificates() {
    const [certificates, setCertificates] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedCert, setSelectedCert] = useState(null);

    useEffect(() => {
        api.getMyCertificates()
            .then(data => {
                setCertificates(data.certificates || []);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, []);

    if (loading) return <div style={{ color: '#9ca3af', padding: '3rem', textAlign: 'center' }}>Loading your certificates...</div>;

    return (
        <div style={{ color: 'white' }}>
            <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.6rem' }}>📜 My Verified Certificates</h2>
            <p style={{ color: '#94a3af', margin: '0 0 2rem' }}>
                All officially recognized digital certificates awarded to you by battle and tournament organizers.
            </p>

            {certificates.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3.5rem', background: '#1e293b', borderRadius: '12px' }}>
                    <div style={{ fontSize: '3.5rem', marginBottom: '0.75rem' }}>🏅</div>
                    <h3 style={{ margin: '0 0 0.5rem' }}>No Certificates Earned Yet</h3>
                    <p style={{ color: '#94a3af', maxWidth: '500px', margin: '0 auto' }}>
                        Compete in team battles and tournaments! When your team ranks in the top tiers configured by the organizer, your verified certificate will appear here.
                    </p>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.25rem' }}>
                    {certificates.map(c => {
                        const isTeam = c.cert_type === 'team';
                        return (
                            <div
                                key={c.id}
                                onClick={() => setSelectedCert(c)}
                                style={{
                                    background: '#1e293b', borderRadius: '12px', padding: '1.5rem',
                                    border: '1px solid #334155', cursor: 'pointer', transition: 'all 0.2s',
                                    display: 'flex', flexDirection: 'column', justifyContent: 'space-between'
                                }}
                                onMouseEnter={e => e.currentTarget.style.borderColor = '#fbbf24'}
                                onMouseLeave={e => e.currentTarget.style.borderColor = '#334155'}
                            >
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                                        <span style={{
                                            fontSize: '0.75rem', padding: '2px 8px', borderRadius: '999px', fontWeight: 'bold',
                                            background: '#fbbf2422', color: '#fbbf24'
                                        }}>
                                            {c.category}
                                        </span>
                                        <span style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: '#94a3af' }}>
                                            {c.certificate_id}
                                        </span>
                                    </div>

                                    <h3 style={{ margin: '0 0 0.3rem', fontSize: '1.2rem', color: 'white' }}>{c.event_name}</h3>
                                    <p style={{ color: '#94a3af', fontSize: '0.85rem', margin: '0 0 1rem' }}>
                                        {isTeam ? `Secured Rank #${c.team_rank} with ${c.team_name}` : `Secured Individual Rank #${c.individual_rank}`}
                                    </p>
                                </div>

                                <div style={{ borderTop: '1px solid #334155', paddingTop: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ color: '#64748b', fontSize: '0.75rem' }}>
                                        {new Date(c.issue_date).toLocaleDateString()}
                                    </span>
                                    <span style={{ color: '#38bdf8', fontSize: '0.85rem', fontWeight: 'bold' }}>
                                        View Certificate →
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Modal for viewing certificate */}
            {selectedCert && (
                <div style={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(5px)',
                    zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
                    overflowY: 'auto'
                }}>
                    <div style={{ position: 'relative', maxWidth: '920px', width: '100%', maxHeight: '95vh', overflowY: 'auto' }}>
                        <button
                            onClick={() => setSelectedCert(null)}
                            style={{
                                position: 'absolute', top: '15px', right: '15px', zIndex: 100,
                                background: 'rgba(0,0,0,0.6)', border: '1px solid #475569', color: 'white',
                                width: '36px', height: '36px', borderRadius: '50%', cursor: 'pointer',
                                fontSize: '1.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center'
                            }}
                        >
                            ✕
                        </button>
                        <CertificateView certificate={selectedCert} />
                    </div>
                </div>
            )}
        </div>
    );
}

