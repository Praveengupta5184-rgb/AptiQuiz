import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../api';
import '../App.css';

export default function TeacherLogin() {
    const navigate = useNavigate();
    const [mode, setMode] = useState('login'); // 'login' | 'register'
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
            let data;
            if (mode === 'login') {
                data = await api.login({ email, password });
            } else {
                if (!displayName.trim()) return setError('Display name is required');
                data = await api.register({ email, password, displayName });
            }
            localStorage.setItem('teacherToken', data.token);
            localStorage.setItem('teacherName', data.teacher.displayName);
            navigate('/teacher');
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            minHeight: '100vh', display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', background: '#0f172a', padding: '1rem'
        }}>
            <Link to="/" style={{ color: '#9ca3af', fontSize: '0.9rem', marginBottom: '2rem', textDecoration: 'none' }}>
                ← Back to Home
            </Link>

            <h1 style={{ color: 'white', marginBottom: '0.5rem', fontSize: '2rem' }}>
                AptiQuiz <span style={{ color: '#3b82f6' }}>Teacher</span>
            </h1>
            <p style={{ color: '#9ca3af', marginBottom: '2rem' }}>
                {mode === 'login' ? 'Sign in to manage your tests' : 'Create your teacher account'}
            </p>

            <form onSubmit={handleSubmit} style={{
                background: '#1e293b', padding: '2rem', borderRadius: '12px',
                width: '100%', maxWidth: '400px', display: 'flex', flexDirection: 'column', gap: '1rem'
            }}>
                {error && (
                    <div style={{
                        padding: '0.75rem', background: '#ef444420', border: '1px solid #ef4444',
                        color: '#fca5a5', borderRadius: '6px', fontSize: '0.9rem'
                    }}>{error}</div>
                )}

                {mode === 'register' && (
                    <div>
                        <label style={{ color: '#9ca3af', display: 'block', marginBottom: '0.4rem', fontSize: '0.9rem' }}>
                            Display Name
                        </label>
                        <input
                            type="text" value={displayName} onChange={e => setDisplayName(e.target.value)}
                            required style={inputStyle}
                            placeholder="e.g. Dr. Priya Sharma"
                        />
                    </div>
                )}

                <div>
                    <label style={{ color: '#9ca3af', display: 'block', marginBottom: '0.4rem', fontSize: '0.9rem' }}>
                        Email
                    </label>
                    <input
                        type="email" value={email} onChange={e => setEmail(e.target.value)}
                        required style={inputStyle}
                        placeholder="teacher@college.edu"
                    />
                </div>

                <div>
                    <label style={{ color: '#9ca3af', display: 'block', marginBottom: '0.4rem', fontSize: '0.9rem' }}>
                        Password {mode === 'register' && <span style={{ color: '#6b7280' }}>(min 8 chars)</span>}
                    </label>
                    <input
                        type="password" value={password} onChange={e => setPassword(e.target.value)}
                        required minLength={8} style={inputStyle}
                    />
                </div>

                <button type="submit" disabled={loading} style={{
                    padding: '0.9rem', background: loading ? '#475569' : '#3b82f6',
                    color: 'white', border: 'none', borderRadius: '6px',
                    fontSize: '1rem', fontWeight: 'bold', cursor: loading ? 'not-allowed' : 'pointer',
                    marginTop: '0.5rem'
                }}>
                    {loading ? 'Please wait...' : (mode === 'login' ? 'Sign In' : 'Create Account')}
                </button>

                <button type="button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null); }}
                    style={{ background: 'transparent', border: 'none', color: '#60a5fa', cursor: 'pointer', fontSize: '0.9rem' }}>
                    {mode === 'login' ? "Don't have an account? Register" : 'Already have an account? Sign In'}
                </button>
            </form>
        </div>
    );
}

const inputStyle = {
    width: '100%', padding: '0.75rem', borderRadius: '6px',
    border: '1px solid #334155', background: '#334155', color: 'white',
    fontSize: '1rem', boxSizing: 'border-box',
};
