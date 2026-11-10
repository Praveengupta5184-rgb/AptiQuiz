/**
 * api.js — Thin fetch wrapper used by all frontend pages.
 *
 * All API requests include the JWT from localStorage.
 * VITE_API_URL is set to empty string in production (same-origin requests).
 * In local dev (client on :5173, server on :3005), set VITE_API_URL=http://localhost:3005
 */

const BASE = import.meta.env.VITE_API_URL || '';

function getToken() {
    return localStorage.getItem('teacherToken');
}

function getStudentToken() {
    return localStorage.getItem('studentToken');
}

async function apiFetch(path, options = {}) {
    const token = getToken();
    const headers = { ...options.headers };
    if (!options._isFormData) headers['Content-Type'] = 'application/json';
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const { _isFormData, ...fetchOptions } = options;
    const res = await fetch(`${BASE}${path}`, { ...fetchOptions, headers });
    const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
}

async function studentApiFetch(path, options = {}) {
    const token = getStudentToken();
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${BASE}${path}`, { ...options, headers });
    const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
}

export const api = {
    // Auth
    register: (body) => apiFetch('/api/auth/register', { method: 'POST', body: JSON.stringify(body) }),
    login: (body) => apiFetch('/api/auth/login', { method: 'POST', body: JSON.stringify(body) }),
    me: () => apiFetch('/api/auth/me'),

    studentRegister: (body) => studentApiFetch('/api/auth/student/register', { method: 'POST', body: JSON.stringify(body) }),
    studentLogin: (body) => studentApiFetch('/api/auth/student/login', { method: 'POST', body: JSON.stringify(body) }),
    studentMe: () => studentApiFetch('/api/auth/student/me'),
    getStudentResults: () => studentApiFetch('/api/student/results'),
    getStudentResultDetails: (id) => studentApiFetch(`/api/student/results/${id}`),

    // Tests
    getTests: () => apiFetch('/api/tests'),
    getTeacherDashboard: () => apiFetch('/api/teacher/dashboard'),
    getTeacherHistory: () => apiFetch('/api/teacher/history'),
    getTeacherRoomResults: (roomId) => apiFetch(`/api/teacher/results/${roomId}`),
    getTeacherRoomTeams: (roomId) => apiFetch(`/api/teacher/room/${roomId}/teams`),
    getTeacherRoomStudents: (roomId) => apiFetch(`/api/teacher/room/${roomId}/students`),
    getTest: (id) => apiFetch(`/api/tests/${id}`),
    createTest: (body) => apiFetch('/api/tests', { method: 'POST', body: JSON.stringify(body) }),
    parsePdf: (formData) => apiFetch('/api/tests/parse-pdf', { method: 'POST', body: formData, _isFormData: true }),
    getTestAnalytics: (id) => apiFetch(`/api/tests/${id}/analytics`),
    getQuestionAnalytics: (id) => apiFetch(`/api/tests/${id}/question-analytics`),

    // Rooms (legacy)
    createRoom: (body) => apiFetch('/api/rooms', { method: 'POST', body: JSON.stringify(body) }),
    getHostRoomInfo: (code) => apiFetch(`/api/rooms/${code}/host-info`),
    getRoomResults: (code) => apiFetch(`/api/rooms/${code}/results`),

    // Team Battles
    getPublicBattles: () => apiFetch('/api/battles/public'),
    createBattle: (body) => apiFetch('/api/battles', { method: 'POST', body: JSON.stringify(body) }),
    createStudentBattle: (body) => studentApiFetch('/api/student/battles', { method: 'POST', body: JSON.stringify(body) }),
    getBattleDetails: (code) => apiFetch(`/api/battles/${code}`),
    joinTeam: (code, sessionTokenHash, teamId) => apiFetch(`/api/battles/${code}/join-team`, { method: 'POST', body: JSON.stringify({ sessionTokenHash, teamId }) }),
    leaveTeam: (code, sessionTokenHash) => apiFetch(`/api/battles/${code}/leave-team`, { method: 'POST', body: JSON.stringify({ sessionTokenHash }) }),
    setReady: (code, sessionTokenHash, ready) => apiFetch(`/api/battles/${code}/ready`, { method: 'POST', body: JSON.stringify({ sessionTokenHash, ready }) }),
    updateTeams: (code, teams, assignments) => apiFetch(`/api/battles/${code}/teams`, { method: 'PUT', body: JSON.stringify({ teams, assignments }) }),
    getBattleResults: (code) => apiFetch(`/api/battles/${code}/results`),

    // Certificates
    issueCertificatesManual: (body) => apiFetch('/api/certificates/issue-manual', { method: 'POST', body: JSON.stringify(body) }),

    // Daily Challenges
    getDailyChallenge: () => studentApiFetch('/api/daily'),
    submitDailyChallenge: (body) => studentApiFetch('/api/daily/submit', { method: 'POST', body: JSON.stringify(body) }),
    getDailyLeaderboard: (date) => studentApiFetch(`/api/daily/leaderboard/${date}`),
    
    // College Leagues
    getColleges: () => studentApiFetch('/api/colleges'),
    getLeagues: () => studentApiFetch('/api/leagues'),

    // ─── Achievements & Profile ───────────────────────────────────────────────
    getMyAchievements: () => studentApiFetch('/api/student/achievements'),
    getMyProfile: () => studentApiFetch('/api/student/profile'),
    getAllAchievementDefinitions: () => studentApiFetch('/api/achievements'),
    markAchievementsSeen: () => studentApiFetch('/api/student/achievements/seen', { method: 'POST' }),

    // ─── Battle History ───────────────────────────────────────────────────────
    getBattleHistory: (params = {}) => {
        const q = new URLSearchParams(params).toString();
        return studentApiFetch(`/api/student/battle-history${q ? '?' + q : ''}`);
    },
    getBattleDetail: (roomId) => studentApiFetch(`/api/student/battle-history/${roomId}`),

    // ─── Tournaments ──────────────────────────────────────────────────────────
    getTournaments: (status) => apiFetch(`/api/tournaments${status ? `?status=${status}` : ''}`),
    getTournament: (id) => apiFetch(`/api/tournaments/${id}`),
    createTournament: (body) => apiFetch('/api/tournaments', { method: 'POST', body: JSON.stringify(body) }),
    startTournament: (id) => apiFetch(`/api/tournaments/${id}/start`, { method: 'POST' }),
    declareMatchWinner: (tourneyId, matchId, body) => apiFetch(`/api/tournaments/${tourneyId}/matches/${matchId}/declare-winner`, { method: 'POST', body: JSON.stringify(body) }),
    registerTournamentTeam: (tourneyId, body) => studentApiFetch(`/api/tournaments/${tourneyId}/register`, { method: 'POST', body: JSON.stringify(body) }),

    // ─── Verified Certificates ────────────────────────────────────────────────
    verifyCertificate: (certId) => apiFetch(`/api/certificates/verify/${certId}`),
    getMyCertificates: () => studentApiFetch('/api/certificates/my-certificates'),
    getCertificateConfig: (roomId, tournamentId, roomCode) => {
        const params = new URLSearchParams();
        if (roomId && !isNaN(parseInt(roomId))) params.append('roomId', roomId);
        if (roomCode) params.append('roomCode', String(roomCode).trim().toUpperCase());
        if (tournamentId && !isNaN(parseInt(tournamentId))) params.append('tournamentId', tournamentId);
        return apiFetch(`/api/certificates/config?${params.toString()}`);
    },
    saveCertificateConfig: (body) => apiFetch('/api/certificates/config', { method: 'POST', body: JSON.stringify(body) }),
    issueCertificates: (body) => apiFetch('/api/certificates/issue', { method: 'POST', body: JSON.stringify(body) }),
    revokeCertificate: (certId, reason) => apiFetch(`/api/certificates/${certId}/revoke`, { method: 'POST', body: JSON.stringify({ reason }) }),

    // ─── Multi-Organizer Anti-Cheat & Super Admin ─────────────────────────────
    getSuspiciousActivity: (params = {}) => {
        const q = new URLSearchParams(params).toString();
        return apiFetch(`/api/teacher/suspicious-activity${q ? '?' + q : ''}`);
    },
    reviewSuspiciousActivity: (logId, body) => apiFetch(`/api/teacher/suspicious-activity/${logId}/review`, { method: 'POST', body: JSON.stringify(body) }),
    getSuperAdminDashboard: () => apiFetch('/api/admin/super-dashboard'),
    toggleOrganizerSuspension: (organizerId, body) => apiFetch(`/api/admin/organizers/${organizerId}/toggle-suspension`, { method: 'POST', body: JSON.stringify(body) }),
};

export const SOCKET_URL = BASE || window.location.origin;
