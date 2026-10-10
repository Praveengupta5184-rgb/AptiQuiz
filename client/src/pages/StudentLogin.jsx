import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';

export default function StudentLogin() {
    const navigate = useNavigate();
    const [isRegister, setIsRegister] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        try {
            if (isRegister) {
                const res = await api.studentRegister({ email, password, displayName });
                localStorage.setItem('studentToken', res.token);
                localStorage.setItem('studentName', res.student.displayName);
                localStorage.setItem('studentId', res.student.id);
            } else {
                const res = await api.studentLogin({ email, password });
                localStorage.setItem('studentToken', res.token);
                localStorage.setItem('studentName', res.student.displayName);
                localStorage.setItem('studentId', res.student.id);
            }
            navigate('/student/dashboard');
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a', padding: '1rem' }}>
            <div style={{ background: '#1e293b', padding: '2.5rem', borderRadius: '12px', width: '100%', maxWidth: '400px', boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }}>
                <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                    <h2 style={{ color: 'white', margin: '0 0 0.5rem', fontSize: '1.75rem' }}>Student Portal</h2>
                    <p style={{ color: '#9ca3af', margin: 0 }}>
                        {isRegister ? 'Create your account' : 'Sign in to view your results'}
                    </p>
                </div>

                {error && (
                    <div style={{ padding: '0.75rem', background: '#ef444420', border: '1px solid #ef4444', color: '#fca5a5', borderRadius: '6px', marginBottom: '1.5rem', fontSize: '0.9rem', textAlign: 'center' }}>
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {isRegister && (
                        <input type="text" placeholder="Full Name" value={displayName} onChange={e => setDisplayName(e.target.value)} required style={inputStyle} />
                    )}
                    <input type="email" placeholder="Email Address" value={email} onChange={e => setEmail(e.target.value)} required style={inputStyle} />
                    <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} style={inputStyle} />

                    <button type="submit" disabled={loading} style={{ ...btnStyle, marginTop: '0.5rem', opacity: loading ? 0.7 : 1 }}>
                        {loading ? 'Please wait...' : isRegister ? 'Create Account' : 'Sign In'}
                    </button>
                </form>

                <div style={{ marginTop: '2rem', textAlign: 'center' }}>
                    <button type="button" onClick={() => setIsRegister(!isRegister)} style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: '0.9rem' }}>
                        {isRegister ? 'Already have an account? Sign in' : "Don't have an account? Register"}
                    </button>
                </div>
            </div>
        </div>
    );
}

const inputStyle = {
    padding: '0.875rem', borderRadius: '6px', border: '1px solid #334155',
    background: '#0f172a', color: 'white', fontSize: '1rem', outline: 'none',
};

const btnStyle = {
    padding: '0.875rem', borderRadius: '6px', border: 'none',
    background: '#3b82f6', color: 'white', fontSize: '1rem', fontWeight: 'bold',
    cursor: 'pointer', transition: 'background 0.2s'
};
