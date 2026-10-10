-- 004_results_unique.sql
-- Add unique constraint so we can UPSERT results safely
ALTER TABLE results ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'results_player_id_room_id_key'
    ) THEN
        ALTER TABLE results ADD CONSTRAINT results_player_id_room_id_key UNIQUE (player_id, room_id);
    END IF;
END
$$;
