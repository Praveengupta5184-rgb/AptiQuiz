-- 008_tournaments.sql
-- Tournament Management System: Tournaments, Teams, Rounds, Matches, and Standings

-- ─── Tournaments Table ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tournaments (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    organizer_teacher_id INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
    question_set_id INTEGER REFERENCES question_sets(id) ON DELETE SET NULL,
    is_public BOOLEAN DEFAULT TRUE,
    access_code VARCHAR(50),
    status VARCHAR(50) DEFAULT 'registration', -- 'registration', 'in_progress', 'completed', 'cancelled'
    
    -- Configuration
    max_teams INTEGER DEFAULT 8,
    team_size INTEGER DEFAULT 4,
    category VARCHAR(100) DEFAULT 'General Aptitude',
    difficulty VARCHAR(50) DEFAULT 'mixed', -- 'easy', 'medium', 'hard', 'mixed'
    rounds_count INTEGER DEFAULT 3,
    questions_per_round INTEGER DEFAULT 10,
    time_per_question INTEGER DEFAULT 20,
    
    -- Timestamps
    registration_start TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    registration_end TIMESTAMP,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tournaments_status ON tournaments(status);
CREATE INDEX IF NOT EXISTS idx_tournaments_organizer ON tournaments(organizer_teacher_id);

-- ─── Tournament Registered Teams ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tournament_teams (
    id SERIAL PRIMARY KEY,
    tournament_id INTEGER REFERENCES tournaments(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    captain_student_id INTEGER REFERENCES students(id) ON DELETE SET NULL,
    status VARCHAR(50) DEFAULT 'approved', -- 'pending', 'approved', 'rejected', 'eliminated', 'active'
    seed INTEGER,                          -- Seeding position (1, 2, 3...)
    registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tournament_id, name)
);

CREATE INDEX IF NOT EXISTS idx_tournament_teams_tourney ON tournament_teams(tournament_id);

-- ─── Tournament Team Members ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tournament_team_members (
    id SERIAL PRIMARY KEY,
    tournament_team_id INTEGER REFERENCES tournament_teams(id) ON DELETE CASCADE,
    student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tournament_team_id, student_id)
);

-- ─── Tournament Rounds ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tournament_rounds (
    id SERIAL PRIMARY KEY,
    tournament_id INTEGER REFERENCES tournaments(id) ON DELETE CASCADE,
    round_number INTEGER NOT NULL,
    name VARCHAR(100) NOT NULL, -- 'Qualification', 'Quarter-Final', 'Semi-Final', 'Final'
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'active', 'completed'
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    UNIQUE(tournament_id, round_number)
);

-- ─── Tournament Matches (Brackets) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tournament_matches (
    id SERIAL PRIMARY KEY,
    tournament_id INTEGER REFERENCES tournaments(id) ON DELETE CASCADE,
    round_id INTEGER REFERENCES tournament_rounds(id) ON DELETE CASCADE,
    match_number INTEGER NOT NULL,
    
    -- Matched Teams (team2 can be NULL if bye)
    team1_id INTEGER REFERENCES tournament_teams(id) ON DELETE SET NULL,
    team2_id INTEGER REFERENCES tournament_teams(id) ON DELETE SET NULL,
    
    -- Associated Game Room for live play
    room_id INTEGER REFERENCES rooms(id) ON DELETE SET NULL,
    
    -- Results
    team1_score INTEGER DEFAULT 0,
    team2_score INTEGER DEFAULT 0,
    winner_team_id INTEGER REFERENCES tournament_teams(id) ON DELETE SET NULL,
    is_bye BOOLEAN DEFAULT FALSE,
    status VARCHAR(50) DEFAULT 'scheduled', -- 'scheduled', 'live', 'completed'
    
    next_match_id INTEGER REFERENCES tournament_matches(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tournament_matches_tourney ON tournament_matches(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_matches_round ON tournament_matches(round_id);

-- ─── Tournament Results / Podium ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tournament_results (
    id SERIAL PRIMARY KEY,
    tournament_id INTEGER REFERENCES tournaments(id) ON DELETE CASCADE UNIQUE,
    champion_team_id INTEGER REFERENCES tournament_teams(id) ON DELETE SET NULL,
    runner_up_team_id INTEGER REFERENCES tournament_teams(id) ON DELETE SET NULL,
    third_place_team_id INTEGER REFERENCES tournament_teams(id) ON DELETE SET NULL,
    mvp_student_id INTEGER REFERENCES students(id) ON DELETE SET NULL,
    summary JSONB,
    declared_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

