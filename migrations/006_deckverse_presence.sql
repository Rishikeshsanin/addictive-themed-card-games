-- DeckVerse-only PRESENCE V2 proposal. REVIEW-ONLY; NEVER auto-apply.
-- Apply ONLY after hub.read_me_first, hub app/resource verification,
-- approved 004 migration, isolated backup/recovery plan and human authorization.
-- As of Agent C review, the connected hub.read_me_first() prerequisite could not
-- be resolved. STOP instead of bypassing a missing Hub safety function.
SELECT hub.assert_app_scope('deckverse', 'deckverse');

-- Does not rewrite current host/player rows. Old seat-0 host remains compatible.
ALTER TABLE deckverse.rooms
  ADD COLUMN IF NOT EXISTS host_seat smallint NOT NULL DEFAULT 0
    CHECK (host_seat BETWEEN 0 AND 3),
  ADD COLUMN IF NOT EXISTS presence_version bigint NOT NULL DEFAULT 0
    CHECK (presence_version >= 0);

-- Explicit server-authorized exit metadata: active=false is not a timeout.
-- Original deckverse.players.last_seen_at remains the authoritative heartbeat.
ALTER TABLE deckverse.players
  ADD COLUMN IF NOT EXISTS left_at timestamptz;

COMMENT ON COLUMN deckverse.rooms.host_seat IS
  'Authoritative host seat. Updated only inside the locked room transaction.';
COMMENT ON COLUMN deckverse.rooms.presence_version IS
  'Monotonic version incremented for host transfers / persisted presence transitions.';
COMMENT ON COLUMN deckverse.players.left_at IS
  'Server-recorded intentional exit; NULL for temporary network loss.';

-- No public schema usage, no new API grants, no SECURITY DEFINER objects, no
-- deletes, no background jobs, no data rewrites and no cross-app changes.
-- Existing RLS/policies and deckverse_app-only grants must be revalidated
-- after authorization and application. Security/performance advisors required.
