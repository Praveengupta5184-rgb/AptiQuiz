import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function StudentJoin() {
    const [code, setCode] = useState('');
    const [name, setName] = useState(localStorage.getItem('studentName') || '');
    const navigate = useNavigate();

    const handleJoin = (e) => {
        e.preventDefault();
        if (code.trim() && name.trim()) {
            localStorage.setItem('studentName', name.trim());
            if (!localStorage.getItem('studentToken')) {
                localStorage.setItem('studentToken', `student-${Math.random().toString(36).substr(2, 9)}`);
            }
            navigate(`/room/${code.trim().toUpperCase()}`);
        }
    };

    return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#0f172a' }}>
            <h1 style={{ color: 'white', marginBottom: '2rem' }}>AptiQuiz Arena</h1>
            
            <form onSubmit={handleJoin} style={{ background: '#1e293b', padding: '2rem', borderRadius: '12px', width: '100%', maxWidth: '400px', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <div>
                    <label style={{ color: '#9ca3af', display: 'block', marginBottom: '0.5rem' }}>Room Code</label>
                    <input type="text" maxLength={5} value={code} onChange={e => setCode(e.target.value.toUpperCase())} required style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: 'none', background: '#334155', color: 'white', fontSize: '1.5rem', textAlign: 'center', letterSpacing: '4px', textTransform: 'uppercase' }} />
                </div>
                
                <div>
                    <label style={{ color: '#9ca3af', display: 'block', marginBottom: '0.5rem' }}>Your Name</label>
                    <input type="text" value={name} onChange={e => setName(e.target.value)} required style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: 'none', background: '#334155', color: 'white', fontSize: '1.2rem' }} />
                </div>
                
                <button type="submit" style={{ padding: '1rem', background: '#10b981', color: 'white', border: 'none', borderRadius: '6px', fontSize: '1.2rem', fontWeight: 'bold', cursor: 'pointer' }}>Join Test</button>
            </form>
        </div>
    );
}
