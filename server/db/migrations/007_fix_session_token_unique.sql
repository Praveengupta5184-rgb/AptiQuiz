-- 007_fix_session_token_unique.sql
-- Fix unique constraint on room_players.session_token_hash
-- Change from UNIQUE(session_token_hash) to UNIQUE(room_id, session_token_hash)

-- Drop the existing unique constraint
ALTER TABLE room_players DROP CONSTRAINT IF EXISTS room_players_session_token_hash_key;
ALTER TABLE room_players DROP CONSTRAINT IF EXISTS room_players_room_id_session_token_hash_key;

-- Add composite unique constraint (room_id, session_token_hash)
ALTER TABLE room_players ADD CONSTRAINT room_players_room_id_session_token_hash_key UNIQUE (room_id, session_token_hash);

-- Also ensure the display_name constraint remains
-- (already exists: UNIQUE(room_id, display_name))