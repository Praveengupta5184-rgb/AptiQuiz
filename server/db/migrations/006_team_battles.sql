-- 006_team_battles.sql
-- Team Battle Mode enhancements

-- Add battle-specific fields to rooms
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT FALSE;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS battle_name VARCHAR(255);
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS min_players_per_team INTEGER DEFAULT 1;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS max_teams INTEGER DEFAULT 10;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS battle_type VARCHAR(50) DEFAULT 'quiz'; -- 'quiz', 'team_battle'

-- Add ready status and team assignment tracking to room_players
ALTER TABLE room_players ADD COLUMN IF NOT EXISTS is_ready BOOLEAN DEFAULT FALSE;
ALTER TABLE room_players ADD COLUMN IF NOT EXISTS joined_team_at TIMESTAMP;
ALTER TABLE room_players ADD COLUMN IF NOT EXISTS assigned_by_host BOOLEAN DEFAULT FALSE;

-- Add team metadata
ALTER TABLE teams ADD COLUMN IF NOT EXISTS color VARCHAR(7) DEFAULT '#3b82f6'; -- hex color
ALTER TABLE teams ADD COLUMN IF NOT EXISTS captain_id INTEGER REFERENCES room_players(id) ON DELETE SET NULL;

-- Indexes for public battle discovery
CREATE INDEX IF NOT EXISTS idx_rooms_public ON rooms(is_public, status) WHERE is_public = TRUE;
CREATE INDEX IF NOT EXISTS idx_rooms_battle_type ON rooms(battle_type);

-- Battle results summary table (for quick leaderboard queries)
CREATE TABLE IF NOT EXISTS battle_results_summary (
    id SERIAL PRIMARY KEY,
    room_id INTEGER REFERENCES rooms(id) ON DELETE CASCADE,
    team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE,
    total_score INTEGER DEFAULT 0,
    member_count INTEGER DEFAULT 0,
    avg_score NUMERIC(10,2) DEFAULT 0,
    mvp_player_id INTEGER REFERENCES room_players(id) ON DELETE SET NULL,
    mvp_score INTEGER DEFAULT 0,
    rank INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(room_id, team_id)
);

-- Player battle stats (individual contributions)
CREATE TABLE IF NOT EXISTS player_battle_stats (
    id SERIAL PRIMARY KEY,
    room_id INTEGER REFERENCES rooms(id) ON DELETE CASCADE,
    player_id INTEGER REFERENCES room_players(id) ON DELETE CASCADE,
    team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL,
    individual_score INTEGER DEFAULT 0,
    contribution_percent NUMERIC(5,2) DEFAULT 0,
    questions_answered INTEGER DEFAULT 0,
    questions_correct INTEGER DEFAULT 0,
    accuracy_percent NUMERIC(5,2) DEFAULT 0,
    is_mvp BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(room_id, player_id)
);

-- Indexes for battle results
CREATE INDEX IF NOT EXISTS idx_battle_results_room ON battle_results_summary(room_id);
CREATE INDEX IF NOT EXISTS idx_player_battle_stats_room ON player_battle_stats(room_id);