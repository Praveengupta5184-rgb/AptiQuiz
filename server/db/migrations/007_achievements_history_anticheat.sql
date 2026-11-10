-- 007_achievements_history_anticheat.sql
-- Achievements, Extended Battle History, Suspicious Activity Logging, Rewards

-- ─── Achievement Definitions ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS achievement_definitions (
    id SERIAL PRIMARY KEY,
    code VARCHAR(100) NOT NULL UNIQUE,       -- e.g. 'first_win', 'quiz_master'
    name VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    icon VARCHAR(50) DEFAULT '🏅',
    category VARCHAR(50) DEFAULT 'general',  -- 'performance', 'social', 'milestone'
    criteria JSONB NOT NULL,                 -- { type, threshold, ... }
    xp_reward INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ─── Player Achievements (earned badges) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS player_achievements (
    id SERIAL PRIMARY KEY,
    student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
    achievement_id INTEGER REFERENCES achievement_definitions(id),
    room_id INTEGER REFERENCES rooms(id) ON DELETE SET NULL,
    earned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_new BOOLEAN DEFAULT TRUE,             -- for "newly unlocked" UI
    UNIQUE(student_id, achievement_id)
);

CREATE INDEX IF NOT EXISTS idx_player_achievements_student ON player_achievements(student_id);

-- ─── Player XP / Profile ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS player_profiles (
    id SERIAL PRIMARY KEY,
    student_id INTEGER REFERENCES students(id) ON DELETE CASCADE UNIQUE,
    total_xp INTEGER DEFAULT 0,
    level INTEGER DEFAULT 1,
    title VARCHAR(100) DEFAULT 'Beginner',
    battles_played INTEGER DEFAULT 0,
    battles_won INTEGER DEFAULT 0,
    total_correct INTEGER DEFAULT 0,
    total_attempted INTEGER DEFAULT 0,
    mvp_count INTEGER DEFAULT 0,
    fastest_answer_ms INTEGER DEFAULT 999999,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_player_profiles_student ON player_profiles(student_id);

-- ─── Reward Transactions ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reward_transactions (
    id SERIAL PRIMARY KEY,
    student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
    reward_type VARCHAR(50) NOT NULL,        -- 'xp', 'badge', 'title', 'trophy'
    reward_value JSONB NOT NULL,             -- { amount: 100 } or { title: 'Champion' }
    reason VARCHAR(255) NOT NULL,            -- 'battle_win', 'achievement', 'mvp'
    room_id INTEGER REFERENCES rooms(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_reward_transactions_student ON reward_transactions(student_id);

-- ─── Suspicious Activity Logs ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS suspicious_activity_logs (
    id SERIAL PRIMARY KEY,
    student_id INTEGER REFERENCES students(id) ON DELETE SET NULL,
    room_id INTEGER REFERENCES rooms(id) ON DELETE SET NULL,
    event_type VARCHAR(100) NOT NULL,        -- 'duplicate_answer', 'late_answer', 'impossible_speed', 'rate_limit', 'reconnect_abuse'
    risk_score INTEGER DEFAULT 1,            -- 1-10
    details JSONB,                           -- { elapsed_ms, threshold, attempt_count, ... }
    reviewed BOOLEAN DEFAULT FALSE,
    reviewed_by INTEGER REFERENCES students(id) ON DELETE SET NULL,
    review_note TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_suspicious_logs_student ON suspicious_activity_logs(student_id);
CREATE INDEX IF NOT EXISTS idx_suspicious_logs_room ON suspicious_activity_logs(room_id);
CREATE INDEX IF NOT EXISTS idx_suspicious_logs_reviewed ON suspicious_activity_logs(reviewed);

-- ─── Seed Default Achievement Definitions ─────────────────────────────────────
INSERT INTO achievement_definitions (code, name, description, icon, category, criteria, xp_reward) VALUES
('first_battle',      'Battle Initiate',    'Complete your first quiz battle',                       '🎮', 'milestone',    '{"type":"battles_played","threshold":1}',           50),
('first_win',         'First Victory',      'Win your first quiz battle (rank #1)',                  '🏆', 'milestone',    '{"type":"battles_won","threshold":1}',              100),
('quiz_master',       'Quiz Master',        'Achieve 90%+ accuracy in a battle (min 5 questions)',  '🎯', 'performance',  '{"type":"accuracy","threshold":90,"min_q":5}',      150),
('speed_demon',       'Speed Demon',        'Answer correctly in under 3 seconds',                   '⚡', 'performance',  '{"type":"fast_answer_ms","threshold":3000}',        100),
('team_player',       'Team Player',        'Participate in 5 team battles',                         '🤝', 'social',       '{"type":"team_battles","threshold":5}',             75),
('mvp',               'MVP',                'Be the top individual scorer in a battle',               '🌟', 'performance',  '{"type":"mvp","threshold":1}',                     125),
('hot_streak',        'On Fire',            'Get a streak of 5 correct answers in a row',            '🔥', 'performance',  '{"type":"streak","threshold":5}',                   75),
('comeback_king',     'Comeback King',      'Finish top 3 after being in bottom half at halftime',   '⬆️', 'performance',  '{"type":"comeback","threshold":1}',                100),
('consistent_scorer', 'Consistent Scorer',  'Score 100+ points in 10 different battles',             '📈', 'milestone',    '{"type":"score_battles","threshold":10,"min_score":100}', 200),
('century',           'Century!',           'Score 100 points in a single question',                 '💯', 'performance',  '{"type":"single_question_score","threshold":100}',  50)
ON CONFLICT (code) DO NOTHING;

-- ─── Extended view: student battle history ───────────────────────────────────
CREATE OR REPLACE VIEW student_battle_history AS
SELECT
    r.id AS room_id,
    r.code AS room_code,
    r.battle_name,
    r.battle_type,
    r.created_at AS battle_date,
    rp.student_id,
    rp.display_name,
    res.total_score,
    res.rank,
    res.accuracy_percent,
    res.attempted,
    res.correct,
    res.avg_response_time_ms,
    res.fastest_answer_ms,
    rp.team_id,
    t.name AS team_name,
    qs.title AS test_title,
    -- Was this player MVP in this battle?
    COALESCE(pbs.is_mvp, FALSE) AS is_mvp
FROM results res
JOIN room_players rp ON res.player_id = rp.id
JOIN rooms r ON res.room_id = r.id
JOIN question_sets qs ON r.question_set_id = qs.id
LEFT JOIN teams t ON rp.team_id = t.id
LEFT JOIN player_battle_stats pbs ON pbs.room_id = r.id AND pbs.player_id = rp.id
WHERE rp.student_id IS NOT NULL;

