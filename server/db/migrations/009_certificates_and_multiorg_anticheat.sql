-- 009_certificates_and_multiorg_anticheat.sql
-- Module 1: Verified Digital Certificates
-- Module 2: Multi-Organizer Anti-Cheat & 3-Level Role Architecture

-- ─── 1. Role System Enhancement on Teachers ───────────────────────────────────
-- Level 1: super_admin, Level 2: organizer/teacher
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'organizer';
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN DEFAULT FALSE;

-- Ensure an initial super admin or promote first teacher if exists
UPDATE teachers SET role = 'super_admin' WHERE id = 1;

-- ─── 2. Audit Logs Table ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    actor_teacher_id INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
    actor_role VARCHAR(50) NOT NULL,
    action VARCHAR(100) NOT NULL,
    target_type VARCHAR(50),
    target_id VARCHAR(100),
    details JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_teacher_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);

-- ─── 3. Multi-Organizer Anti-Cheat Enhancements ───────────────────────────────
-- Associate suspicious activity with organizer and tournament
ALTER TABLE suspicious_activity_logs ADD COLUMN IF NOT EXISTS organizer_id INTEGER REFERENCES teachers(id) ON DELETE SET NULL;
ALTER TABLE suspicious_activity_logs ADD COLUMN IF NOT EXISTS tournament_id INTEGER REFERENCES tournaments(id) ON DELETE SET NULL;
ALTER TABLE suspicious_activity_logs ADD COLUMN IF NOT EXISTS risk_level VARCHAR(20) DEFAULT 'low'; -- 'low', 'medium', 'high', 'critical'
ALTER TABLE suspicious_activity_logs ADD COLUMN IF NOT EXISTS resolution_action VARCHAR(50); -- 'warning', 'penalized', 'cleared', 'restricted'

CREATE INDEX IF NOT EXISTS idx_suspicious_logs_organizer ON suspicious_activity_logs(organizer_id);
CREATE INDEX IF NOT EXISTS idx_suspicious_logs_tourney ON suspicious_activity_logs(tournament_id);
CREATE INDEX IF NOT EXISTS idx_suspicious_logs_risk ON suspicious_activity_logs(risk_level);

-- ─── 4. Moderation Actions Table ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS moderation_actions (
    id SERIAL PRIMARY KEY,
    organizer_id INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
    student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
    room_id INTEGER REFERENCES rooms(id) ON DELETE SET NULL,
    tournament_id INTEGER REFERENCES tournaments(id) ON DELETE SET NULL,
    action_type VARCHAR(50) NOT NULL, -- 'warning', 'session_terminate', 'temporary_restrict', 'clear'
    reason TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_mod_actions_student ON moderation_actions(student_id);
CREATE INDEX IF NOT EXISTS idx_mod_actions_organizer ON moderation_actions(organizer_id);

-- ─── 5. Certificate Configurations Table ──────────────────────────────────────
-- Set by the organizer per room/battle or tournament
CREATE TABLE IF NOT EXISTS certificate_configs (
    id SERIAL PRIMARY KEY,
    organizer_id INTEGER REFERENCES teachers(id) ON DELETE CASCADE,
    room_id INTEGER REFERENCES rooms(id) ON DELETE CASCADE,
    tournament_id INTEGER REFERENCES tournaments(id) ON DELETE CASCADE,
    
    is_enabled BOOLEAN DEFAULT TRUE,
    top_teams_count INTEGER DEFAULT 3,
    top_individuals_count INTEGER DEFAULT 3,
    
    title VARCHAR(255) DEFAULT 'Certificate of Excellence',
    description TEXT DEFAULT 'For outstanding performance and aptitude demonstration in AptiQuiz battle.',
    category VARCHAR(50) DEFAULT 'Rank', -- 'Winner', 'Runner-up', 'Top Ranker', 'Participation'
    style_theme VARCHAR(50) DEFAULT 'gold', -- 'gold', 'blue', 'academic'
    
    organizer_name VARCHAR(150),
    organizer_designation VARCHAR(150) DEFAULT 'Quiz Master / Lead Evaluator',
    institution_name VARCHAR(255),
    institution_logo_url TEXT,
    issue_date DATE DEFAULT CURRENT_DATE,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Either room_id or tournament_id must be populated
    CONSTRAINT unique_room_cert_config UNIQUE (room_id),
    CONSTRAINT unique_tourney_cert_config UNIQUE (tournament_id)
);

-- ─── 6. Issued Certificates Table ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS certificates (
    id SERIAL PRIMARY KEY,
    certificate_id VARCHAR(64) NOT NULL UNIQUE, -- e.g. APTI-2026-X7K9P2
    
    organizer_id INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
    room_id INTEGER REFERENCES rooms(id) ON DELETE SET NULL,
    tournament_id INTEGER REFERENCES tournaments(id) ON DELETE SET NULL,
    student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
    
    -- Holder details preserved permanently at issue time
    student_name VARCHAR(150) NOT NULL,
    event_name VARCHAR(255) NOT NULL,
    cert_type VARCHAR(50) NOT NULL, -- 'team' or 'individual'
    
    -- Distinction / Rank details
    team_name VARCHAR(150),
    team_rank INTEGER,
    team_score INTEGER,
    individual_rank INTEGER,
    individual_score INTEGER,
    category VARCHAR(50) NOT NULL, -- 'Winner', 'Runner-up', 'Third Rank', 'Top Ranker', 'Participation'
    
    -- Presentation Config snapshot
    title VARCHAR(255) NOT NULL,
    description TEXT,
    style_theme VARCHAR(50) DEFAULT 'gold',
    organizer_name VARCHAR(150) NOT NULL,
    organizer_designation VARCHAR(150),
    institution_name VARCHAR(255),
    issue_date DATE NOT NULL,
    
    -- Status
    status VARCHAR(50) DEFAULT 'Valid', -- 'Valid', 'Revoked'
    revocation_reason TEXT,
    revoked_at TIMESTAMP,
    
    qr_code_data_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Prevent duplicate certificate for same student and same event/type
    CONSTRAINT unique_student_room_cert UNIQUE(student_id, room_id, cert_type),
    CONSTRAINT unique_student_tourney_cert UNIQUE(student_id, tournament_id, cert_type)
);

CREATE INDEX IF NOT EXISTS idx_cert_lookup ON certificates(certificate_id);
CREATE INDEX IF NOT EXISTS idx_cert_student ON certificates(student_id);
CREATE INDEX IF NOT EXISTS idx_cert_organizer ON certificates(organizer_id);
CREATE INDEX IF NOT EXISTS idx_cert_status ON certificates(status);

