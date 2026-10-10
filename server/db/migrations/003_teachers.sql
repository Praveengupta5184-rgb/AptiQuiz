-- 003_teachers.sql
-- Teacher accounts for secure room ownership

CREATE TABLE IF NOT EXISTS teachers (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    display_name VARCHAR(100) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Link question_sets to teachers
ALTER TABLE question_sets ADD COLUMN IF NOT EXISTS teacher_id INTEGER REFERENCES teachers(id) ON DELETE SET NULL;

-- Link rooms to teachers (separate from host_token_hash which is kept for socket auth)
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS teacher_id INTEGER REFERENCES teachers(id) ON DELETE SET NULL;

-- Index for teacher lookups
CREATE INDEX IF NOT EXISTS idx_question_sets_teacher ON question_sets(teacher_id);
CREATE INDEX IF NOT EXISTS idx_rooms_teacher ON rooms(teacher_id);
