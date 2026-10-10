import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api';

export default function HostSettings() {
    const { testId } = useParams();
    const navigate = useNavigate();
    const [teamMode, setTeamMode] = useState(false);
    const [teamSizeLimit, setTeamSizeLimit] = useState(4);
    const [teamCount, setTeamCount] = useState(2);
    const [adaptiveDifficulty, setAdaptiveDifficulty] = useState(false);
    const [colleges, setColleges] = useState([]);
    const [selectedCollegeId, setSelectedCollegeId] = useState('');

    useEffect(() => {
        api.getColleges()
            .then(data => setColleges(data.colleges || []))
            .catch(() => {});
    }, []);

    const handleStart = () => {
        const query = new URLSearchParams({
            teamMode: teamMode.toString(),
            teamSizeLimit: teamSizeLimit.toString(),
            teamCount: teamCount.toString(),
            adaptiveDifficulty: adaptiveDifficulty.toString(),
            ...(selectedCollegeId ? { collegeId: selectedCollegeId } : {})
        }).toString();
        navigate(`/teacher/test/${testId}/host?${query}`);
    };

    return (
        <div style={{ padding: '2rem', color: 'white', maxWidth: '600px', margin: '0 auto' }}>
            <h2 style={{ marginBottom: '1.5rem' }}>Host Room Settings</h2>
            
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
                    <div style={{ marginTop: '1rem', paddingLeft: '1.7rem', display: 'flex', gap: '1rem' }}>
                        <div>
                            <label style={{ display: 'block', color: '#9ca3af', marginBottom: '0.5rem' }}>Max Players per Team (3-5)</label>
                            <input 
                                type="number" 
                                min="3" 
                                max="5"
                                value={teamSizeLimit} 
                                onChange={e => setTeamSizeLimit(parseInt(e.target.value))}
                                style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #3b82f6', background: '#0f172a', color: 'white', width: '100px' }}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', color: '#9ca3af', marginBottom: '0.5rem' }}>Number of Teams</label>
                            <input 
                                type="number" 
                                min="2" 
                                max="10"
                                value={teamCount} 
                                onChange={e => setTeamCount(parseInt(e.target.value))}
                                style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #3b82f6', background: '#0f172a', color: 'white', width: '100px' }}
                            />
                        </div>
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
                    style={{ flex: 2, padding: '0.8rem', background: '#3b82f6', border: 'none', color: 'white', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                >
                    Create Room
                </button>
            </div>
        </div>
    );
}
