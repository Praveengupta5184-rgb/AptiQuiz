import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api';

export default function HostSettings() {
    const { testId } = useParams();
    const navigate = useNavigate();
    const isSubmittingRef = useRef(false);
    const [teamMode, setTeamMode] = useState(false);
    const [isPublic, setIsPublic] = useState(true);
    const [battleName, setBattleName] = useState('');
    const [teamSizeLimit, setTeamSizeLimit] = useState(4);
    const [studentCreatedTeams, setStudentCreatedTeams] = useState(true);
    const [adaptiveDifficulty, setAdaptiveDifficulty] = useState(false);
    const [colleges, setColleges] = useState([]);
    const [selectedCollegeId, setSelectedCollegeId] = useState('');
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        api.getColleges()
            .then(data => setColleges(data.colleges || []))
            .catch(() => {});
    }, []);

    const handleStart = async () => {
        if (isSubmittingRef.current || creating) return;
        isSubmittingRef.current = true;
        setCreating(true);
        setError(null);

        try {
            const data = await api.createRoom({
                questionSetId: testId,
                collegeId: selectedCollegeId ? parseInt(selectedCollegeId, 10) : null,
                isPublic,
                battleName: battleName.trim() || undefined,
                settings: {
                    maxPlayers: 50,
                    advanceEarly: true,
                    teamMode,
                    teamSizeLimit,
                    teamCount: studentCreatedTeams ? 0 : 2,
                    studentCreatedTeams,
                    adaptiveDifficulty,
                    isPublic,
                    battleName: battleName.trim() || undefined,
                }
            });

            if (!data.success) throw new Error(data.error || 'Failed to create room');
            sessionStorage.setItem(`hostToken_${data.code}`, data.hostSocketToken);
            if (data.roomId) sessionStorage.setItem(`roomId_${data.code}`, data.roomId);

            navigate(`/teacher/room/${data.code}`);
        } catch (err) {
            isSubmittingRef.current = false;
            setError(err.message || 'Failed to create room');
            setCreating(false);
        }
    };

    return (
        <div style={{ padding: '2rem', color: 'white', maxWidth: '600px', margin: '0 auto' }}>
            <h2 style={{ marginBottom: '1.5rem' }}>Host Room Settings</h2>
            
            {error && (
                <div style={{
                    padding: '0.8rem 1rem', background: '#ef444420', border: '1px solid #ef4444',
                    color: '#fca5a5', borderRadius: '6px', marginBottom: '1.5rem', fontSize: '0.95rem'
                }}>
                    ⚠️ {error}
                </div>
            )}
            
            <div style={{ background: '#1e293b', padding: '1.5rem', borderRadius: '8px', marginBottom: '1.5rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '1.1rem' }}>
                    <input 
                        type="checkbox" 
                        checked={teamMode} 
                        onChange={e => setTeamMode(e.target.checked)}
                        style={{ width: '1.2rem', height: '1.2rem' }}
                    />
                    Enable Team Battles
                </label>
                
                {teamMode && (
                    <div style={{ marginTop: '1rem', paddingLeft: '1.7rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div>
                            <label style={{ display: 'block', color: '#9ca3af', marginBottom: '0.4rem', fontSize: '0.9rem' }}>
                                Battle Name (Optional)
                            </label>
                            <input 
                                type="text"
                                placeholder="e.g. Friday Placement Clash"
                                value={battleName}
                                onChange={e => setBattleName(e.target.value)}
                                style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid #334155', background: '#0f172a', color: 'white' }}
                            />
                        </div>

                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '1rem', color: '#60a5fa' }}>
                            <input 
                                type="checkbox" 
                                checked={isPublic} 
                                onChange={e => setIsPublic(e.target.checked)}
                                style={{ width: '1.1rem', height: '1.1rem' }}
                            />
                            🌐 Make Public (Show in Student Public Battle Lobby)
                        </label>

                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '1rem', color: '#10b981' }}>
                            <input 
                                type="checkbox" 
                                checked={studentCreatedTeams} 
                                onChange={e => setStudentCreatedTeams(e.target.checked)}
                                style={{ width: '1.1rem', height: '1.1rem' }}
                            />
                            🏷️ Let students choose & name their own teams
                        </label>

                        <div>
                            <label style={{ display: 'block', color: '#9ca3af', marginBottom: '0.5rem', fontSize: '0.85rem' }}>
                                Max Players per Team (1-10)
                            </label>
                            <input 
                                type="number" 
                                min="1" 
                                max="10"
                                value={teamSizeLimit} 
                                onChange={e => setTeamSizeLimit(parseInt(e.target.value) || 4)}
                                style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #3b82f6', background: '#0f172a', color: 'white', width: '120px' }}
                            />
                        </div>

                        <p style={{ color: '#9ca3af', margin: 0, fontSize: '0.85rem' }}>
                            💡 {studentCreatedTeams ? 'Students can form their own named teams in the lobby and friends can join them.' : 'Default teams will be generated.'}
                        </p>
                    </div>
                )}
            </div>

            <div style={{ background: '#1e293b', padding: '1.5rem', borderRadius: '8px', marginBottom: '1.5rem' }}>
                <h3 style={{ margin: '0 0 1rem 0' }}>Gameplay Settings</h3>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '1.1rem' }}>
                    <input 
                        type="checkbox" 
                        checked={adaptiveDifficulty} 
                        onChange={e => setAdaptiveDifficulty(e.target.checked)}
                        style={{ width: '1.2rem', height: '1.2rem' }}
                    />
                    Enable Adaptive Difficulty
                </label>
                <p style={{ color: '#9ca3af', marginTop: '0.5rem', fontSize: '0.9rem' }}>
                    Questions will automatically adjust to class performance. Easier questions if accuracy drops, harder questions if accuracy is high.
                </p>
            </div>

            <div style={{ background: '#1e293b', padding: '1.5rem', borderRadius: '8px', marginBottom: '1.5rem' }}>
                <h3 style={{ margin: '0 0 1rem 0' }}>College League Settings</h3>
                <label style={{ display: 'block', color: '#9ca3af', marginBottom: '0.5rem' }}>Link this room to a college (Optional)</label>
                <select 
                    value={selectedCollegeId} 
                    onChange={e => setSelectedCollegeId(e.target.value)}
                    style={{ padding: '0.75rem', borderRadius: '4px', border: '1px solid #3b82f6', background: '#0f172a', color: 'white', width: '100%', fontSize: '1rem' }}
                >
                    <option value="">-- None (General Game) --</option>
                    {colleges.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                </select>
            </div>

            <div style={{ display: 'flex', gap: '1rem' }}>
                <button 
                    onClick={() => navigate('/teacher')}
                    style={{ flex: 1, padding: '0.8rem', background: 'transparent', border: '1px solid #475569', color: 'white', borderRadius: '4px', cursor: 'pointer' }}
                >
                    Cancel
                </button>
                <button 
                    onClick={handleStart}
                    disabled={creating}
                    style={{ flex: 2, padding: '0.8rem', background: creating ? '#475569' : '#3b82f6', border: 'none', color: 'white', borderRadius: '4px', cursor: creating ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}
                >
                    {creating ? 'Creating Room...' : '🚀 Create Room'}
                </button>
            </div>
        </div>
    );
}
