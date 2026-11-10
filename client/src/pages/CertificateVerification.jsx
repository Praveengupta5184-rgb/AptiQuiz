import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api';
import CertificateView from '../components/CertificateView';

export default function CertificateVerification() {
    const { certId: urlCertId } = useParams();
    const [searchId, setSearchId] = useState(urlCertId || '');
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const [searched, setSearched] = useState(false);

    const performVerification = (idToVerify) => {
        if (!idToVerify || !idToVerify.trim()) return;
        setLoading(true);
        setSearched(true);
        api.verifyCertificate(idToVerify.trim().toUpperCase())
            .then(data => {
                setResult(data);
                setLoading(false);
            })
            .catch(() => {
                setResult({ isValid: false, status: 'Invalid' });
                setLoading(false);
            });
    };

    useEffect(() => {
        if (urlCertId) {
            performVerification(urlCertId);
        }
    }, [urlCertId]);

    const handleSubmit = (e) => {
        e.preventDefault();
        performVerification(searchId);
    };

    return (
        <div style={{ color: 'white', minHeight: '100vh', background: '#0a0f1d', padding: '2rem 1rem' }}>
            {/* Header */}
            <div style={{ maxWidth: '800px', margin: '0 auto 2rem', textAlign: 'center' }}>
                <Link to="/" style={{ color: '#38bdf8', textDecoration: 'none', fontSize: '0.9rem', marginBottom: '1rem', display: 'inline-block' }}>
                    ← Back to AptiQuiz Home
                </Link>
                <h1 style={{ fontSize: '2.2rem', margin: '0.5rem 0', color: 'white' }}>
                    🛡️ Official Certificate Verification
                </h1>
                <p style={{ color: '#94a3af', margin: 0 }}>
                    Verify the authenticity and current validity of any AptiQuiz issued digital certificate.
                </p>

                {/* Search Bar */}
                <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem', maxWidth: '550px', margin: '1.5rem auto 0' }}>
                    <input
                        type="text"
                        placeholder="e.g. APTI-2026-X7K9P2"
                        value={searchId}
                        onChange={e => setSearchId(e.target.value)}
                        style={{
                            flex: 1, padding: '0.8rem 1rem', background: '#1e293b',
                            border: '1px solid #334155', borderRadius: '8px', color: 'white',
                            fontSize: '1rem', textTransform: 'uppercase', fontFamily: 'monospace'
                        }}
                    />
                    <button
                        type="submit"
                        disabled={loading}
                        style={{
                            padding: '0.8rem 1.5rem', background: '#3b82f6', color: 'white',
                            border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer'
                        }}
                    >
                        {loading ? 'Checking...' : 'Verify'}
                    </button>
                </form>
            </div>

            {/* Results Section */}
            {searched && !loading && (
                <div style={{ maxWidth: '900px', margin: '0 auto' }}>
                    {result && result.isValid ? (
                        <div>
                            {/* Validation Status Banner */}
                            <div style={{
                                padding: '1rem 1.5rem', background: '#10b98122',
                                border: '1px solid #10b981', borderRadius: '10px',
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                                    <span style={{ fontSize: '2rem' }}>✅</span>
                                    <div>
                                        <div style={{ fontWeight: 'bold', fontSize: '1.1rem', color: '#10b981' }}>
                                            Authentic & Valid Certificate
                                        </div>
                                        <div style={{ fontSize: '0.85rem', color: '#cbd5e1' }}>
                                            Issued by <strong>{result.certificate.organizerName}</strong> on {new Date(result.certificate.issueDate).toLocaleDateString()}
                                        </div>
                                    </div>
                                </div>
                                <div style={{ fontFamily: 'monospace', color: '#fbbf24', fontWeight: 'bold', fontSize: '0.9rem' }}>
                                    {result.certificate.id}
                                </div>
                            </div>

                            {/* Render the full interactive Certificate */}
                            <CertificateView certificate={result.certificate} />
                        </div>
                    ) : (
                        <div style={{
                            padding: '3rem', background: '#1e293b', borderRadius: '12px',
                            border: '1px solid #ef4444', textAlign: 'center', maxWidth: '600px', margin: '0 auto'
                        }}>
                            <div style={{ fontSize: '3.5rem', marginBottom: '1rem' }}>❌</div>
                            <h2 style={{ color: '#ef4444', margin: '0 0 0.5rem' }}>Certificate Not Found or Invalid</h2>
                            <p style={{ color: '#94a3af', lineHeight: '1.6' }}>
                                We could not find a verified record matching this certificate ID. Please ensure the code was entered accurately or verify that the certificate has not been revoked.
                            </p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

