-- 001_initial.sql

CREATE TABLE colleges (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE seasons (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    start_date TIMESTAMP NOT NULL,
    end_date TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE question_sets (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE questions (
    id SERIAL PRIMARY KEY,
    question_set_id INTEGER REFERENCES question_sets(id) ON DELETE CASCADE,
    topic VARCHAR(100) NOT NULL,
    difficulty VARCHAR(50) NOT NULL, -- easy, medium, hard
    text TEXT NOT NULL,
    options JSONB NOT NULL, -- Array of strings
    correct_option_index INTEGER NOT NULL,
    explanation TEXT,
    image_url TEXT,
    table_data JSONB, -- Optional HTML table representation
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE rooms (
    id SERIAL PRIMARY KEY,
    code VARCHAR(10) NOT NULL UNIQUE,
    status VARCHAR(50) DEFAULT 'lobby', -- lobby, active, finished
    question_set_id INTEGER REFERENCES question_sets(id),
    college_id INTEGER REFERENCES colleges(id),
    settings JSONB NOT NULL,
    host_token_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL
);

CREATE TABLE teams (
    id SERIAL PRIMARY KEY,
    room_id INTEGER REFERENCES rooms(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    score INTEGER DEFAULT 0
);

CREATE TABLE room_players (
    id SERIAL PRIMARY KEY,
    room_id INTEGER REFERENCES rooms(id) ON DELETE CASCADE,
    session_token_hash VARCHAR(255) NOT NULL UNIQUE,
    display_name VARCHAR(100) NOT NULL,
    team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL,
    score INTEGER DEFAULT 0,
    streak INTEGER DEFAULT 0,
    powerups JSONB DEFAULT '{"50_50": 1, "double_points": 1, "time_freeze": 1}',
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(room_id, display_name)
);

CREATE TABLE game_questions (
    id SERIAL PRIMARY KEY,
    room_id INTEGER REFERENCES rooms(id) ON DELETE CASCADE,
    question_id INTEGER REFERENCES questions(id),
    order_index INTEGER NOT NULL,
    start_at TIMESTAMP,
    deadline TIMESTAMP
);

CREATE TABLE answers (
    id SERIAL PRIMARY KEY,
    room_id INTEGER REFERENCES rooms(id) ON DELETE CASCADE,
    player_id INTEGER REFERENCES room_players(id) ON DELETE CASCADE,
    game_question_id INTEGER REFERENCES game_questions(id) ON DELETE CASCADE,
    chosen_option_index INTEGER NOT NULL,
    is_correct BOOLEAN NOT NULL,
    points_awarded INTEGER NOT NULL,
    receipt_timestamp TIMESTAMP NOT NULL,
    compensated_elapsed_ms INTEGER NOT NULL,
    UNIQUE(player_id, game_question_id)
);

CREATE TABLE results (
    id SERIAL PRIMARY KEY,
    room_id INTEGER REFERENCES rooms(id) ON DELETE CASCADE,
    player_id INTEGER REFERENCES room_players(id) ON DELETE CASCADE,
    total_score INTEGER NOT NULL,
    rank INTEGER NOT NULL,
    accuracy_percent NUMERIC(5,2) NOT NULL,
    attempted INTEGER NOT NULL,
    correct INTEGER NOT NULL,
    avg_response_time_ms INTEGER NOT NULL,
    fastest_answer_ms INTEGER NOT NULL,
    topic_stats JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE league_scores (
    id SERIAL PRIMARY KEY,
    college_id INTEGER REFERENCES colleges(id) ON DELETE CASCADE,
    season_id INTEGER REFERENCES seasons(id) ON DELETE CASCADE,
    topic VARCHAR(100), -- Null for overall
    score NUMERIC(10,2) NOT NULL DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(college_id, season_id, topic)
);

CREATE TABLE daily_challenges (
    id SERIAL PRIMARY KEY,
    challenge_date DATE NOT NULL UNIQUE,
    questions JSONB NOT NULL -- array of question IDs
);

CREATE TABLE daily_attempts (
    id SERIAL PRIMARY KEY,
    daily_challenge_id INTEGER REFERENCES daily_challenges(id) ON DELETE CASCADE,
    player_identifier VARCHAR(255) NOT NULL, -- lightweight profile token
    score INTEGER NOT NULL,
    completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(daily_challenge_id, player_identifier)
);

CREATE TABLE flags (
    id SERIAL PRIMARY KEY,
    room_id INTEGER REFERENCES rooms(id) ON DELETE CASCADE,
    player_id INTEGER REFERENCES room_players(id) ON DELETE CASCADE,
    reason VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Basic Indexes
CREATE INDEX idx_room_code ON rooms(code);
CREATE INDEX idx_room_players_token ON room_players(session_token_hash);
CREATE INDEX idx_answers_player ON answers(player_id, game_question_id);
