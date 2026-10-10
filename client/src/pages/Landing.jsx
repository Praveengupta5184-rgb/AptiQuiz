import React from 'react';
import { useNavigate } from 'react-router-dom';
import '../App.css';

export default function Landing() {
    const navigate = useNavigate();

    return (
        <div className="app-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
            <header style={{ marginBottom: '3rem', textAlign: 'center' }}>
                <h1 style={{ fontSize: 'clamp(2rem, 5vw, 3rem)', margin: 0 }}>
                    AptiQuiz <span className="subtitle">The Placement Arena</span>
                </h1>
                <p style={{ color: '#9ca3af', marginTop: '0.5rem' }}>Real-time aptitude testing for campus placements</p>
            </header>
            
            <main style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', justifyContent: 'center', padding: '0 1rem' }}>
                <div className="game-card" style={{ width: '280px', cursor: 'pointer', textAlign: 'center' }} onClick={() => navigate('/teacher/login')}>
                    <div className="topic-badge">For Faculty</div>
                    <h2 style={{ color: 'white', margin: '1rem 0 0.5rem' }}>Teacher Portal</h2>
                    <p style={{ color: '#cbd5e1', marginBottom: '1.5rem', fontSize: '0.9rem' }}>Create tests, host rooms, and view real results.</p>
                    <button className="option-btn" style={{ background: '#3b82f6', color: 'white', width: '100%' }}>
                        Sign In / Register
                    </button>
                </div>

                <div className="game-card" style={{ width: '280px', cursor: 'pointer', textAlign: 'center', border: '2px solid #10b981' }} onClick={() => navigate('/join')}>
                    <div className="topic-badge" style={{ background: '#10b981' }}>For Students</div>
                    <h2 style={{ color: 'white', margin: '1rem 0 0.5rem' }}>Join a Test</h2>
                    <p style={{ color: '#cbd5e1', marginBottom: '1.5rem', fontSize: '0.9rem' }}>Enter your room code to join a live test.</p>
                    <button className="option-btn" style={{ background: '#10b981', color: 'white', width: '100%' }}>
                        Join Now
                    </button>
                    <div style={{ marginTop: '1rem' }}>
                        <button onClick={(e) => { e.stopPropagation(); navigate('/student/login'); }} style={{ background: 'none', border: 'none', color: '#10b981', cursor: 'pointer', fontSize: '0.85rem', textDecoration: 'underline' }}>
                            Sign in to view past results
                        </button>
                    </div>
                </div>
            </main>
        </div>
    );
}
