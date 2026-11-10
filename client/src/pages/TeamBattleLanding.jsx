import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';

const TEAM_COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

export default function TeamBattleLanding() {
    const navigate = useNavigate();
    const [battles, setBattles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [activeTab, setActiveTab] = useState('public');
    const [searchQuery, setSearchQuery] = useState('');

    // Check teacher auth
    useEffect(() => {
        const token = localStorage.getItem('teacherToken');
        if (!token) {
            navigate('/teacher/login');
        }
    }, [navigate]);

    const loadPublicBattles = useCallback(async () => {
        try {
            setLoading(true);
            const data = await api.getPublicBattles?.() || { battles: [] };
            setBattles(data.battles || []);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (activeTab === 'public') {
            loadPublicBattles();
        }
    }, [activeTab, loadPublicBattles]);

    const filteredBattles = battles.filter(b => 
        b.battle_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        b.test_title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        b.code.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const cardStyle = {
        background: '#1e293b',
        padding: '1.5rem',
        borderRadius: '12px',
        border: '1px solid #334155',
        transition: 'transform 0.2s, border-color 0.2s',
        cursor: 'pointer'
    };

    const btnStyle = (bg) => ({
        padding: '0.75rem 1.5rem',
        background: bg,
        color: 'white',
        border: 'none',
        borderRadius: '8px',
        cursor: 'pointer',
        fontWeight: 'bold',
        fontSize: '1rem'
    });

    const tabStyle = (active) => ({
        padding: '1rem 2rem',
        background: active ? '#3b82f6' : '#1e293b',
        color: active ? 'white' : '#9ca3af',
        border: 'none',
        borderRadius: '8px 8px 0 0',
        cursor: 'pointer',
        fontWeight: active ? 'bold' : 'normal',
        fontSize: '1rem',
        borderBottom: active ? 'none' : '2px solid transparent'
    });

    return (
        <div style={{ minHeight: '100vh', background: '#0f172a', color: 'white' }}>
            {/* Header */}
            <header style={{ padding: '1rem 2rem', background: '#1e293b', borderBottom: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Link to="/teacher" style={{ color: 'white', textDecoration: 'none', fontSize: '1.5rem', fontWeight: 'bold' }}>
                    AptiQuiz Teacher
                </Link>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <span style={{ color: '#9ca3af' }}>Team Battle Mode</span>
                    <Link to="/teacher" style={{ ...btnStyle('transparent'), border: '1px solid #475569', background: 'transparent' }}>
                        ← Back to Dashboard
                    </Link>
                </div>
            </header>

            <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
                {/* Hero Section */}
                <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
                    <h1 style={{ fontSize: '3rem', fontWeight: '800', marginBottom: '1rem', background: 'linear-gradient(135deg, #3b82f6, #8b5cf6, #10b981)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                        Team Battle Mode
                    </h1>
                    <p style={{ fontSize: '1.25rem', color: '#9ca3af', maxWidth: '700px', margin: '0 auto' }}>
                        Create competitive multiplayer team battles. Students join teams, answer individually, and compete for team glory with real-time leaderboards.
                    </p>
                </div>

                {/* Tab Navigation */}
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '2rem', background: '#1e293b', borderRadius: '12px', padding: '0.5rem', maxWidth: '600px', marginLeft: 'auto', marginRight: 'auto' }}>
                    <button onClick={() => setActiveTab('public')} style={tabStyle(activeTab === 'public')}>🌐 Public Battles</button>
                    <button onClick={() => setActiveTab('create')} style={tabStyle(activeTab === 'create')}>⚔️ Create Battle</button>
                    <button onClick={() => setActiveTab('join')} style={tabStyle(activeTab === 'join')}>🔐 Join Private</button>
                </div>

                {/* Tab Content */}
                {activeTab === 'public' && (
                    <div style={{ animation: 'fadeIn 0.3s' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <h2 style={{ margin: 0 }}>Available Public Battles</h2>
                            <input
                                type="text"
                                placeholder="Search battles..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                style={{
                                    padding: '0.5rem 1rem',
                                    background: '#0f172a',
                                    border: '1px solid #3b82f6',
                                    borderRadius: '8px',
                                    color: 'white',
                                    width: '300px'
                                }}
                            />
                        </div>

                        {loading ? (
                            <div style={{ padding: '3rem', textAlign: 'center', color: '#9ca3af' }}>Loading public battles...</div>
                        ) : error ? (
                            <div style={{ padding: '2rem', background: '#7f1d1d', color: '#fca5a5', borderRadius: '8px', textAlign: 'center' }}>
                                Error: {error}
                                <button onClick={loadPublicBattles} style={{ marginLeft: '1rem', ...btnStyle('#ef4444') }}>Retry</button>
                            </div>
                        ) : filteredBattles.length === 0 ? (
                            <div style={{ padding: '3rem', background: '#1e293b', borderRadius: '12px', textAlign: 'center', color: '#9ca3af', border: '2px dashed #334155' }}>
                                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🏟️</div>
                                <h3 style={{ margin: '0 0 0.5rem', color: 'white' }}>No Public Battles Found</h3>
                                <p>Create the first battle or check back later!</p>
                            </div>
                        ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '1.5rem' }}>
                                {filteredBattles.map(battle => (
                                    <Link key={battle.id} to={`/battle/${battle.code}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                                        <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                                                <div>
                                                    <h3 style={{ margin: '0 0 0.25rem', fontSize: '1.25rem' }}>{battle.battle_name || battle.test_title || 'Untitled Battle'}</h3>
                                                    <div style={{ display: 'flex', gap: '1rem', color: '#9ca3af', fontSize: '0.85rem' }}>
                                                        <span>📝 {battle.test_title}</span>
                                                        <span>🏷️ {battle.code}</span>
                                                    </div>
                                                </div>
                                                <span style={{
                                                    padding: '0.25rem 0.75rem',
                                                    background: battle.status === 'lobby' ? '#10b981' : battle.status === 'active' ? '#f59e0b' : '#64748b',
                                                    borderRadius: '999px',
                                                    fontSize: '0.75rem',
                                                    fontWeight: 'bold',
                                                    textTransform: 'uppercase'
                                                }}>
                                                    {battle.status === 'lobby' ? 'Lobby' : battle.status === 'active' ? 'Live' : 'Finished'}
                                                </span>
                                            </div>

                                            <div style={{ display: 'flex', gap: '1.5rem', color: '#9ca3af', fontSize: '0.9rem', marginBottom: '1rem' }}>
                                                <span>👥 {battle.participant_count || 0} players</span>
                                                <span>🏷️ {battle.team_count || 0} teams</span>
                                            </div>

                                            <div style={{ display: 'flex', gap: '0.5rem', marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid #334155' }}>
                                                <button style={{ flex: 1, ...btnStyle('#3b82f6'), padding: '0.5rem' }}>
                                                    {battle.status === 'lobby' ? 'Join Lobby' : 'Spectate'}
                                                </button>
                                            </div>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'create' && (
                    <CreateBattleForm onCreated={(code) => {
                        setActiveTab('public');
                        loadPublicBattles();
                        navigate(`/battle/${code}/lobby`);
                    }} />
                )}

                {activeTab === 'join' && (
                    <JoinPrivateBattleForm onJoined={(code) => {
                        navigate(`/battle/${code}/select-team`);
                    }} />
                )}
            </main>
        </div>
    );
}
// Create Battle Form Component
function CreateBattleForm({ onCreated }) {

    const [step, setStep] = useState(1); // 1: select test, 2: configure, 3: teams
    const [tests, setTests] = useState([]);
    const [selectedTestId, setSelectedTestId] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Config state
    const [config, setConfig] = useState({
        battleName: '',
        isPublic: false,
        teamSizeLimit: 4,
        teamCount: 4,
        maxTeams: 10,
        minPlayersPerTeam: 1,
        timePerQuestion: 20,
        adaptiveDifficulty: false,
    });

    // Team configs
    const [teamConfigs, setTeamConfigs] = useState([]);

    const loadTests = useCallback(async () => {
        try {
            const data = await api.getTests();
            setTests(data);
        } catch (err) {
            setError('Failed to load tests');
        }
    }, []);

    useEffect(() => {
        loadTests();
    }, [loadTests]);

    const handleCreate = async () => {
        if (!selectedTestId) {
            setError('Please select a test');
            return;
        }
        if (!config.battleName.trim()) {
            setError('Please enter a battle name');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            // Build team configs array
            const teamsToCreate = teamConfigs.length > 0 ? teamConfigs :
                Array.from({ length: config.teamCount }, (_, i) => ({
                    name: `Team ${String.fromCharCode(65 + i)}`,
                    maxSize: config.teamSizeLimit,
                    color: TEAM_COLORS[i % TEAM_COLORS.length]
                }));

            const data = await api.createBattle({
                questionSetId: selectedTestId,
                settings: {
                    teamMode: true,
                    teamSizeLimit: config.teamSizeLimit,
                    teamCount: teamsToCreate.length,
                    maxTeams: config.maxTeams,
                    minPlayersPerTeam: config.minPlayersPerTeam,
                    timePerQuestion: config.timePerQuestion,
                    adaptiveDifficulty: config.adaptiveDifficulty,
                },
                isPublic: config.isPublic,
                battleName: config.battleName,
                teamConfigs: teamsToCreate,
            });

            if (data.success) {
                onCreated(data.code);
            } else {
                throw new Error(data.error || 'Failed to create battle');
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const btnStyle = (bg) => ({
        padding: '0.75rem 1.5rem',
        background: bg,
        color: 'white',
        border: 'none',
        borderRadius: '8px',
        cursor: 'pointer',
        fontWeight: 'bold',
        fontSize: '1rem'
    });

    const inputStyle = {
        width: '100%',
        padding: '0.75rem',
        background: '#0f172a',
        border: '1px solid #334155',
        borderRadius: '8px',
        color: 'white',
        fontSize: '1rem',
        boxSizing: 'border-box',
        marginBottom: '1rem'
    };

    // Step 1: Select Test
    if (step === 1) {
        return (
            <div style={{ maxWidth: '700px', margin: '0 auto' }}>
                <div style={{ background: '#1e293b', padding: '2rem', borderRadius: '12px', border: '1px solid #334155' }}>
                    <h2 style={{ margin: '0 0 0.5rem' }}>Step 1: Select Test</h2>
                    <p style={{ color: '#9ca3af', marginBottom: '2rem' }}>Choose a test to base your battle on</p>

                    {error && <div style={{ background: '#7f1d1d', color: '#fca5a5', padding: '1rem', borderRadius: '8px', marginBottom: '1rem' }}>{error}</div>}

                    <div style={{ display: 'grid', gap: '1rem' }}>
                        {tests.length === 0 ? (
                            <div style={{ padding: '3rem', textAlign: 'center', color: '#9ca3af' }}>
                                No tests found. <Link to="/teacher/create" style={{ color: '#3b82f6' }}>Create a test first</Link>.
                            </div>
                        ) : (
                            tests.map(test => (
                                <button
                                    key={test.id}
                                    onClick={() => { setSelectedTestId(test.id); setStep(2); }}
                                    style={{
                                        ...cardStyle,
                                        textAlign: 'left',
                                        border: selectedTestId === test.id ? '2px solid #3b82f6' : '1px solid #334155',
                                        background: selectedTestId === test.id ? '#1e3a5f' : '#1e293b'
                                    }}
                                >
                                    <h4 style={{ margin: '0 0 0.5rem' }}>{test.title}</h4>
                                    <p style={{ margin: 0, color: '#9ca3af', fontSize: '0.9rem' }}>
                                        {test.question_count} questions · {test.description || 'No description'}
                                    </p>
                                </button>
                            ))
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // Step 2: Configure Battle
    if (step === 2) {
        return (
            <div style={{ maxWidth: '700px', margin: '0 auto' }}>
                <div style={{ background: '#1e293b', padding: '2rem', borderRadius: '12px', border: '1px solid #334155' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                        <h2 style={{ margin: 0 }}>Step 2: Configure Battle</h2>
                        <button onClick={() => setStep(1)} style={{ ...btnStyle('transparent'), border: '1px solid #475569' }}>← Back</button>
                    </div>

                    {error && <div style={{ background: '#7f1d1d', color: '#fca5a5', padding: '1rem', borderRadius: '8px', marginBottom: '1rem' }}>{error}</div>}

                    <div style={{ display: 'grid', gap: '1.5rem' }}>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', color: '#9ca3af' }}>Battle Name</label>
                            <input
                                type="text"
                                value={config.battleName}
                                onChange={e => setConfig({...config, battleName: e.target.value})}
                                placeholder="e.g., Friday Night Battle"
                                style={inputStyle}
                            />
                        </div>

                        <div>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                                <input
                                    type="checkbox"
                                    checked={config.isPublic}
                                    onChange={e => setConfig({...config, isPublic: e.target.checked})}
                                />
                                <span>Make this battle public (discoverable in lobby)</span>
                            </label>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', color: '#9ca3af' }}>Max Players per Team</label>
                                <input
                                    type="number"
                                    min="1"
                                    max="20"
                                    value={config.teamSizeLimit}
                                    onChange={e => setConfig({...config, teamSizeLimit: parseInt(e.target.value) || 1})}
                                    style={inputStyle}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', color: '#9ca3af' }}>Number of Teams</label>
                                <input
                                    type="number"
                                    min="2"
                                    max="20"
                                    value={config.teamCount}
                                    onChange={e => setConfig({...config, teamCount: parseInt(e.target.value) || 2})}
                                    style={inputStyle}
                                />
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', color: '#9ca3af' }}>Max Teams (limit)</label>
                                <input
                                    type="number"
                                    min="2"
                                    max="50"
                                    value={config.maxTeams}
                                    onChange={e => setConfig({...config, maxTeams: parseInt(e.target.value) || 10})}
                                    style={inputStyle}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', color: '#9ca3af' }}>Min Players per Team</label>
                                <input
                                    type="number"
                                    min="1"
                                    max="20"
                                    value={config.minPlayersPerTeam}
                                    onChange={e => setConfig({...config, minPlayersPerTeam: parseInt(e.target.value) || 1})}
                                    style={inputStyle}
                                />
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', color: '#9ca3af' }}>Time per Question (seconds)</label>
                                <input
                                    type="number"
                                    min="5"
                                    max="300"
                                    value={config.timePerQuestion}
                                    onChange={e => setConfig({...config, timePerQuestion: parseInt(e.target.value) || 20})}
                                    style={inputStyle}
                                />
                            </div>
                        </div>

                        <div>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                                <input
                                    type="checkbox"
                                    checked={config.adaptiveDifficulty}
                                    onChange={e => setConfig({...config, adaptiveDifficulty: e.target.checked})}
                                />
                                <span>Enable Adaptive Difficulty (questions adjust to team performance)</span>
                            </label>
                        </div>

                        <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                            <button onClick={() => setStep(1)} style={{ flex: 1, ...btnStyle('transparent'), border: '1px solid #475569' }}>← Back</button>
                            <button onClick={() => setStep(3)} style={{ flex: 2, ...btnStyle('#3b82f6') }}>Next: Customize Teams →</button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Step 3: Customize Teams
    if (step === 3) {
        // Initialize team configs if empty
        if (teamConfigs.length === 0) {
            const initialTeams = Array.from({ length: config.teamCount }, (_, i) => ({
                name: `Team ${String.fromCharCode(65 + i)}`,
                maxSize: config.teamSizeLimit,
                color: TEAM_COLORS[i % TEAM_COLORS.length]
            }));
            setTeamConfigs(initialTeams);
        }

        const updateTeam = (index, field, value) => {
            const newTeams = [...teamConfigs];
            newTeams[index] = { ...newTeams[index], [field]: value };
            setTeamConfigs(newTeams);
        };

        const addTeam = () => {
            if (teamConfigs.length >= config.maxTeams) return;
            setTeamConfigs([
                ...teamConfigs,
                {
                    name: `Team ${String.fromCharCode(65 + teamConfigs.length)}`,
                    maxSize: config.teamSizeLimit,
                    color: TEAM_COLORS[teamConfigs.length % TEAM_COLORS.length]
                }
            ]);
        };

        const removeTeam = (index) => {
            if (teamConfigs.length <= 2) return;
            setTeamConfigs(teamConfigs.filter((_, i) => i !== index));
        };

        return (
            <div style={{ maxWidth: '700px', margin: '0 auto' }}>
                <div style={{ background: '#1e293b', padding: '2rem', borderRadius: '12px', border: '1px solid #334155' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                        <h2 style={{ margin: 0 }}>Step 3: Customize Teams</h2>
                        <button onClick={() => setStep(2)} style={{ ...btnStyle('transparent'), border: '1px solid #475569' }}>← Back</button>
                    </div>

                    {error && <div style={{ background: '#7f1d1d', color: '#fca5a5', padding: '1rem', borderRadius: '8px', marginBottom: '1rem' }}>{error}</div>}

                    <p style={{ color: '#9ca3af', marginBottom: '1.5rem' }}>
                        Customize team names and colors. Each team can have up to {config.teamSizeLimit} players.
                    </p>

                    <div style={{ display: 'grid', gap: '1rem', marginBottom: '1.5rem' }}>
                        {teamConfigs.map((team, index) => (
                            <div key={index} style={{ background: '#0f172a', padding: '1.5rem', borderRadius: '8px', border: `2px solid ${team.color}`, display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: team.color, flexShrink: 0 }} />
                                <input
                                    type="text"
                                    value={team.name}
                                    onChange={e => updateTeam(index, 'name', e.target.value)}
                                    style={{ flex: 1, minWidth: '200px', padding: '0.5rem', background: '#1e293b', border: '1px solid #334155', borderRadius: '4px', color: 'white', fontSize: '1rem' }}
                                />
                                <input
                                    type="color"
                                    value={team.color}
                                    onChange={e => updateTeam(index, 'color', e.target.value)}
                                    style={{ width: '50px', height: '40px', border: 'none', borderRadius: '4px', cursor: 'pointer', background: 'none' }}
                                />
                                <span style={{ color: '#9ca3af', fontSize: '0.85rem' }}>Max: {team.maxSize} players</span>
                                {teamConfigs.length > 2 && (
                                    <button onClick={() => removeTeam(index)} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '0.5rem' }}>✕</button>
                                )}
                            </div>
                        ))}
                    </div>

                    {teamConfigs.length < config.maxTeams && (
                        <button onClick={addTeam} style={{ width: '100%', ...btnStyle('#10b981'), marginBottom: '1rem' }}>
                            + Add Team ({teamConfigs.length}/{config.maxTeams})
                        </button>
                    )}

                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <button onClick={() => setStep(2)} style={{ flex: 1, ...btnStyle('transparent'), border: '1px solid #475569' }}>← Back</button>
                        <button onClick={handleCreate} disabled={loading} style={{ flex: 2, ...btnStyle(loading ? '#475569' : '#10b981') }}>
                            {loading ? 'Creating Battle...' : '⚔️ Create Battle'}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return null;
}

// Join Private Battle Form Component
function JoinPrivateBattleForm({ onJoined }) {
    const [code, setCode] = useState('');
    const [name, setName] = useState(localStorage.getItem('studentName') || '');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const handleJoin = async (e) => {
        e.preventDefault();
        setError(null);
        
        if (!code.trim() || !name.trim()) {
            setError('Please enter both battle code and your name');
            return;
        }

        setLoading(true);
        
        try {
            // Store name and generate token
            localStorage.setItem('studentName', name.trim());
            if (!localStorage.getItem('studentToken')) {
                localStorage.setItem('studentToken', `student-${Math.random().toString(36).substr(2, 9)}`);
            }
            
            // Verify battle exists
            const data = await api.getBattleDetails?.(code.trim().toUpperCase());
            if (!data || !data.room) {
                throw new Error('Battle not found');
            }
            
            onJoined(code.trim().toUpperCase());
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const inputStyle = {
        width: '100%',
        padding: '0.75rem',
        background: '#0f172a',
        border: '1px solid #334155',
        borderRadius: '8px',
        color: 'white',
        fontSize: '1.25rem',
        textAlign: 'center',
        letterSpacing: '4px',
        textTransform: 'uppercase',
        boxSizing: 'border-box',
        marginBottom: '1.5rem'
    };

    const btnStyle = (bg) => ({
        padding: '1rem 2rem',
        background: bg,
        color: 'white',
        border: 'none',
        borderRadius: '8px',
        cursor: 'pointer',
        fontWeight: 'bold',
        fontSize: '1.1rem',
        width: '100%'
    });

    return (
        <div style={{ maxWidth: '500px', margin: '0 auto' }}>
            <div style={{ background: '#1e293b', padding: '2.5rem', borderRadius: '16px', border: '1px solid #334155', textAlign: 'center' }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔐</div>
                <h2 style={{ margin: '0 0 0.5rem', fontSize: '2rem' }}>Join Private Battle</h2>
                <p style={{ color: '#9ca3af', marginBottom: '2rem' }}>Enter the battle code shared by the host</p>

                {error && <div style={{ background: '#7f1d1d', color: '#fca5a5', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', textAlign: 'left' }}>{error}</div>}

                <form onSubmit={handleJoin}>
                    <div style={{ marginBottom: '1.5rem', textAlign: 'left' }}>
                        <label style={{ display: 'block', color: '#9ca3af', marginBottom: '0.5rem' }}>Battle Code</label>
                        <input
                            type="text"
                            maxLength={5}
                            value={code}
                            onChange={e => setCode(e.target.value.toUpperCase())}
                            required
                            style={inputStyle}
                            placeholder="ABC12"
                            autoFocus
                        />
                    </div>

                    <div style={{ marginBottom: '1.5rem', textAlign: 'left' }}>
                        <label style={{ display: 'block', color: '#9ca3af', marginBottom: '0.5rem' }}>Your Name</label>
                        <input
                            type="text"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            required
                            style={{
                                ...inputStyle,
                                fontSize: '1.1rem',
                                letterSpacing: 'normal',
                                textTransform: 'none',
                                textAlign: 'left'
                            }}
                            placeholder="Enter your name"
                        />
                    </div>

                    <button type="submit" disabled={loading} style={btnStyle(loading ? '#475569' : '#10b981')}>
                        {loading ? 'Joining...' : 'Join Battle'}
                    </button>
                </form>

                <p style={{ color: '#64748b', fontSize: '0.85rem', marginTop: '1.5rem' }}>
                    Don't have a code? <Link to="/battle" style={{ color: '#3b82f6' }}>Browse public battles</Link> or ask the host for the private code.
                </p>
            </div>
        </div>
    );
}

// Add API methods to api.js (inline for now, will be added to api.js later)
api.getPublicBattles = async () => {
    const BASE = import.meta.env.VITE_API_URL || '';
    const res = await fetch(`${BASE}/api/battles/public`);
    return res.json();
};

api.createBattle = async (body) => {
    const BASE = import.meta.env.VITE_API_URL || '';
    const token = localStorage.getItem('teacherToken');
    const res = await fetch(`${BASE}/api/battles`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(body)
    });
    return res.json();
};

api.getBattleDetails = async (code) => {
    const BASE = import.meta.env.VITE_API_URL || '';
    const res = await fetch(`${BASE}/api/battles/${code}`);
    return res.json();
};