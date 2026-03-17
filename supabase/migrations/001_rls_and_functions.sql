-- Fluido: RLS policies and RPC functions for Supabase-primary architecture
-- Run this against your Supabase project via the SQL editor or CLI.

-- ============================================================================
-- 1. Enable RLS on all tables
-- ============================================================================

ALTER TABLE decks ENABLE ROW LEVEL SECURITY;
ALTER TABLE note_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE card_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 2. RLS policies — users can only access their own data
-- ============================================================================

-- Drop existing policies if re-running
DO $$ BEGIN
  -- decks
  DROP POLICY IF EXISTS "Users access own decks" ON decks;
  DROP POLICY IF EXISTS "Users access own note_types" ON note_types;
  DROP POLICY IF EXISTS "Users access own notes" ON notes;
  DROP POLICY IF EXISTS "Users access own cards" ON cards;
  DROP POLICY IF EXISTS "Users access own card_states" ON card_states;
  DROP POLICY IF EXISTS "Users access own review_logs" ON review_logs;
  DROP POLICY IF EXISTS "Users access own settings" ON user_settings;
END $$;

CREATE POLICY "Users access own decks" ON decks
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users access own note_types" ON note_types
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users access own notes" ON notes
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users access own cards" ON cards
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users access own card_states" ON card_states
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users access own review_logs" ON review_logs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users access own settings" ON user_settings
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- 3. Default user_id on insert (so client doesn't need to pass it)
-- ============================================================================

ALTER TABLE decks ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE note_types ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE notes ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE cards ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE card_states ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE review_logs ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE user_settings ALTER COLUMN user_id SET DEFAULT auth.uid();

-- ============================================================================
-- 4. RPC: get_decks_with_counts()
--    Returns all decks with new/learning/due card counts in a single query.
-- ============================================================================

CREATE OR REPLACE FUNCTION get_decks_with_counts()
RETURNS TABLE (
  id text,
  name text,
  parent_id text,
  language text,
  source text,
  created_at timestamptz,
  updated_at timestamptz,
  new_count bigint,
  learning_count bigint,
  due_count bigint
) LANGUAGE sql STABLE SECURITY INVOKER AS $$
  SELECT
    d.id, d.name, d.parent_id, d.language, d.source, d.created_at, d.updated_at,
    COALESCE(SUM(CASE WHEN c.card_type = 'new' AND c.suspended = 0 THEN 1 ELSE 0 END), 0) AS new_count,
    COALESCE(SUM(CASE WHEN c.card_type IN ('learning', 'relearning') AND c.suspended = 0 THEN 1 ELSE 0 END), 0) AS learning_count,
    COALESCE(SUM(
      CASE WHEN c.card_type = 'review' AND c.suspended = 0
           AND cs.due <= now()
      THEN 1 ELSE 0 END
    ), 0) AS due_count
  FROM decks d
  LEFT JOIN cards c ON c.deck_id = d.id AND c.user_id = d.user_id
  LEFT JOIN card_states cs ON cs.card_id = c.id
  WHERE d.user_id = auth.uid()
  GROUP BY d.id
  ORDER BY d.name;
$$;

-- ============================================================================
-- 5. RPC: get_review_queue(deck_id, new_limit)
--    Returns review + learning + new cards for a session.
-- ============================================================================

CREATE OR REPLACE FUNCTION get_review_queue(p_deck_id text, p_new_limit int DEFAULT 20)
RETURNS TABLE (
  card_id text,
  note_id text,
  deck_id text,
  template_index int,
  card_type text,
  difficulty float8,
  stability float8,
  due timestamptz,
  "interval" float8,
  reps int,
  lapses int,
  last_review timestamptz,
  note_type_id text,
  fields text,
  tags text
) LANGUAGE plpgsql STABLE SECURITY INVOKER AS $$
DECLARE
  v_today_start timestamptz;
  v_seen_today bigint;
  v_remaining int;
BEGIN
  v_today_start := date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';

  -- Count distinct cards reviewed today in this deck
  SELECT COUNT(DISTINCT rl.card_id) INTO v_seen_today
  FROM review_logs rl
  JOIN cards c ON rl.card_id = c.id
  WHERE c.deck_id = p_deck_id
    AND c.user_id = auth.uid()
    AND rl.review_time >= v_today_start;

  v_remaining := GREATEST(0, p_new_limit - v_seen_today::int);

  RETURN QUERY
    -- Review cards due now
    (SELECT c.id, c.note_id, c.deck_id, c.template_index, c.card_type,
            cs.difficulty, cs.stability, cs.due, cs.interval, cs.reps, cs.lapses, cs.last_review,
            n.note_type_id, n.fields, n.tags
     FROM cards c
     JOIN card_states cs ON c.id = cs.card_id
     JOIN notes n ON c.note_id = n.id
     WHERE c.deck_id = p_deck_id AND c.user_id = auth.uid()
       AND c.card_type = 'review' AND c.suspended = 0
       AND cs.due <= now()
     ORDER BY cs.due ASC)

    UNION ALL

    -- Learning / relearning cards
    (SELECT c.id, c.note_id, c.deck_id, c.template_index, c.card_type,
            cs.difficulty, cs.stability, cs.due, cs.interval, cs.reps, cs.lapses, cs.last_review,
            n.note_type_id, n.fields, n.tags
     FROM cards c
     JOIN card_states cs ON c.id = cs.card_id
     JOIN notes n ON c.note_id = n.id
     WHERE c.deck_id = p_deck_id AND c.user_id = auth.uid()
       AND c.card_type IN ('learning', 'relearning') AND c.suspended = 0
     ORDER BY cs.due ASC)

    UNION ALL

    -- New cards (limited by daily allowance)
    (SELECT c.id, c.note_id, c.deck_id, c.template_index, c.card_type,
            cs.difficulty, cs.stability, cs.due, cs.interval, cs.reps, cs.lapses, cs.last_review,
            n.note_type_id, n.fields, n.tags
     FROM cards c
     JOIN card_states cs ON c.id = cs.card_id
     JOIN notes n ON c.note_id = n.id
     WHERE c.deck_id = p_deck_id AND c.user_id = auth.uid()
       AND c.card_type = 'new' AND c.suspended = 0
     ORDER BY c.created_at ASC
     LIMIT v_remaining);
END;
$$;
