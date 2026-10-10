-- 002_add_time_limit.sql
ALTER TABLE questions ADD COLUMN time_limit INTEGER DEFAULT 10;
