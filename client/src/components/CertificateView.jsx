import React, { useRef } from 'react';

/**
 * Official Verified Certificate Component
 * Supports 'gold', 'blue', and 'academic' themes.
 * Provides instant printable/downloadable styling and embedded QR verification code.
 */
export default function CertificateView({ certificate, onDownload = null }) {
    const certRef = useRef(null);

    if (!certificate) return null;

    const {
        certificate_id,
        id,
        student_name,
        studentName,
        event_name,
        eventName,
        cert_type,
        certType,
        team_name,
        teamName,
        team_rank,
        teamRank,
        individual_rank,
        individualRank,
        individual_score,
        individualScore,
        category,
        title,
        description,
        style_theme,
        styleTheme,
        organizer_name,
        organizerName,
        organizer_designation,
        organizerDesignation,
        institution_name,
        institutionName,
        issue_date,
        issueDate,
        status,
        qr_code_data_url,
    } = certificate;

    const certId = certificate_id || id;
    const name = student_name || studentName;
    const event = event_name || eventName;
    const type = cert_type || certType;
    const tName = team_name || teamName;
    const tRank = team_rank || teamRank;
    const iRank = individual_rank || individualRank;
    const iScore = individual_score || individualScore;
    const certTitle = title || 'Certificate of Excellence';
    const certDesc = description || 'For outstanding aptitude and performance.';
    const theme = style_theme || styleTheme || 'gold';
    const orgName = organizer_name || organizerName;
    const orgDesig = organizer_designation || organizerDesignation || 'Quiz Master / Organizer';
    const instName = institution_name || institutionName;
    const dateStr = issue_date || issueDate;
    const isRevoked = status === 'Revoked';

    // Theme Styles
    const THEMES = {
        gold: {
            border: '#fbbf24',
            accent: '#d97706',
            badgeBg: 'linear-gradient(135deg, #fbbf24, #d97706)',
            sealColor: '#fbbf24',
            bg: '#0f172a'
        },
        blue: {
            border: '#38bdf8',
            accent: '#0284c7',
            badgeBg: 'linear-gradient(135deg, #38bdf8, #0284c7)',
            sealColor: '#38bdf8',
            bg: '#0b132b'
        },
        academic: {
            border: '#94a3b8',
            accent: '#475569',
            badgeBg: 'linear-gradient(135deg, #64748b, #334155)',
            sealColor: '#cbd5e1',
            bg: '#111827'
        }
    };

    const currentTheme = THEMES[theme] || THEMES.gold;

    const handlePrint = () => {
        window.print();
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            {/* The Certificate Frame */}
            <div
                ref={certRef}
                className="certificate-print-area"
                style={{
                    width: '860px',
                    minHeight: '600px',
                    background: currentTheme.bg,
                    border: `8px double ${currentTheme.border}`,
                    borderRadius: '16px',
                    padding: '2.5rem',
                    position: 'relative',
                    color: 'white',
                    boxShadow: '0 12px 36px rgba(0,0,0,0.6)',
                    margin: '1rem auto',
                    boxSizing: 'border-box',
                    overflow: 'hidden'
                }}
            >
                {/* Revoked watermark if applicable */}
                {isRevoked && (
                    <div style={{
                        position: 'absolute', top: '40%', left: '15%', right: '15%',
                        transform: 'rotate(-25deg)',
                        fontSize: '5rem', fontWeight: '900', color: 'rgba(239, 68, 68, 0.4)',
                        border: '8px solid rgba(239, 68, 68, 0.5)',
                        padding: '1rem', textAlign: 'center', pointerEvents: 'none',
                        zIndex: 10, letterSpacing: '0.5rem'
                    }}>
                        REVOKED
                    </div>
                )}

                {/* Decorative Corner Ornaments */}
                <div style={{ position: 'absolute', top: '15px', left: '15px', width: '30px', height: '30px', borderTop: `3px solid ${currentTheme.border}`, borderLeft: `3px solid ${currentTheme.border}` }} />
                <div style={{ position: 'absolute', top: '15px', right: '15px', width: '30px', height: '30px', borderTop: `3px solid ${currentTheme.border}`, borderRight: `3px solid ${currentTheme.border}` }} />
                <div style={{ position: 'absolute', bottom: '15px', left: '15px', width: '30px', height: '30px', borderBottom: `3px solid ${currentTheme.border}`, borderLeft: `3px solid ${currentTheme.border}` }} />
                <div style={{ position: 'absolute', bottom: '15px', right: '15px', width: '30px', height: '30px', borderBottom: `3px solid ${currentTheme.border}`, borderRight: `3px solid ${currentTheme.border}` }} />

                {/* Header */}
                <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                    {instName && (
                        <div style={{ fontSize: '1rem', textTransform: 'uppercase', letterSpacing: '2px', color: '#94a3b8', marginBottom: '0.25rem' }}>
                            {instName}
                        </div>
                    )}
                    <h1 style={{
                        margin: '0', fontSize: '2.5rem', fontWeight: '800',
                        letterSpacing: '3px', textTransform: 'uppercase',
                        color: currentTheme.border,
                        textShadow: '0 2px 10px rgba(0,0,0,0.5)'
                    }}>
                        {certTitle}
                    </h1>
                    <div style={{ fontSize: '0.85rem', color: '#94a3b8', letterSpacing: '4px', textTransform: 'uppercase', marginTop: '0.2rem' }}>
                        OFFICIAL VERIFIED RECOGNITION
                    </div>
                </div>

                {/* Awarded To */}
                <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                    <p style={{ fontStyle: 'italic', color: '#cbd5e1', fontSize: '1rem', margin: '0 0 0.5rem' }}>
                        This is proudly presented to
                    </p>
                    <div style={{
                        fontSize: '2.4rem', fontWeight: 'bold', color: 'white',
                        borderBottom: `2px solid ${currentTheme.accent}`,
                        display: 'inline-block', padding: '0 2rem 0.4rem',
                        letterSpacing: '1px'
                    }}>
                        {name}
                    </div>
                </div>

                {/* Rank & Distinction Statement */}
                <div style={{ textAlign: 'center', maxWidth: '650px', margin: '0 auto 2rem', lineHeight: '1.6' }}>
                    <p style={{ color: '#e2e8f0', fontSize: '1.05rem', margin: 0 }}>
                        {type === 'team' ? (
                            <>
                                for securing <strong style={{ color: currentTheme.border }}>Rank #{tRank}</strong> with team <strong style={{ color: '#60a5fa' }}>{tName}</strong> in <strong style={{ color: 'white' }}>{event}</strong>.
                            </>
                        ) : (
                            <>
                                for achieving <strong style={{ color: currentTheme.border }}>Rank #{iRank}</strong> {iScore ? `(${iScore} points)` : ''} in <strong style={{ color: 'white' }}>{event}</strong>.
                            </>
                        )}
                    </p>
                    <p style={{ color: '#94a3af', fontSize: '0.88rem', marginTop: '0.5rem' }}>
                        {certDesc}
                    </p>
                </div>

                {/* Footer with Signatures & QR Code */}
                <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
                    borderTop: '1px solid #334155', paddingTop: '1.5rem', marginTop: 'auto'
                }}>
                    {/* Issuer Signature */}
                    <div style={{ textAlign: 'left', minWidth: '180px' }}>
                        <div style={{ fontFamily: 'cursive', fontSize: '1.4rem', color: currentTheme.border, marginBottom: '0.2rem' }}>
                            {orgName}
                        </div>
                        <div style={{ borderTop: `1px solid ${currentTheme.border}`, paddingTop: '0.3rem' }}>
                            <div style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{orgName}</div>
                            <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{orgDesig}</div>
                        </div>
                    </div>

                    {/* QR Code & Verification ID */}
                    <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        {qr_code_data_url ? (
                            <img
                                src={qr_code_data_url}
                                alt="QR Verification"
                                style={{ width: '90px', height: '90px', background: 'white', padding: '4px', borderRadius: '6px' }}
                            />
                        ) : (
                            <div style={{ width: '90px', height: '90px', background: '#334155', borderRadius: '6px' }} />
                        )}
                        <span style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: currentTheme.border, marginTop: '0.3rem', fontWeight: 'bold' }}>
                            {certId}
                        </span>
                        <span style={{ fontSize: '0.65rem', color: '#64748b' }}>Scan to Verify Authenticity</span>
                    </div>

                    {/* Issue Date & Official Stamp */}
                    <div style={{ textAlign: 'right', minWidth: '180px' }}>
                        <div style={{ fontSize: '0.85rem', color: '#cbd5e1', marginBottom: '0.2rem' }}>
                            Date: <strong>{new Date(dateStr).toLocaleDateString()}</strong>
                        </div>
                        <div style={{
                            display: 'inline-block', padding: '4px 12px', borderRadius: '999px',
                            background: isRevoked ? '#ef444422' : '#10b98122',
                            color: isRevoked ? '#ef4444' : '#10b981',
                            border: `1px solid ${isRevoked ? '#ef4444' : '#10b981'}`,
                            fontSize: '0.75rem', fontWeight: 'bold', textTransform: 'uppercase'
                        }}>
                            ● {status}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.3rem' }}>
                            AptiQuiz Certified
                        </div>
                    </div>
                </div>
            </div>

            {/* Print / Download Button */}
            <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem' }}>
                <button
                    onClick={handlePrint}
                    style={{
                        padding: '0.6rem 1.4rem', background: '#3b82f6', color: 'white',
                        border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: '0.5rem',
                        boxShadow: '0 4px 12px rgba(59, 130, 246, 0.4)'
                    }}
                >
                    🖨️ Print / Save as PDF
                </button>
            </div>
        </div>
    );
}

