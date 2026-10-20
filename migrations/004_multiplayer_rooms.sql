-- DeckVerse-only V2 migration. REVIEW before applying. No production execution in this PR.
-- Must run only after reading hub.read_me_first and verifying hub.apps/deckverse scope.
SELECT hub.assert_app_scope('deckverse','deckverse');

ALTER TABLE deckverse.rooms
  ADD COLUMN IF NOT EXISTS player_count smallint NOT NULL DEFAULT 2
  CHECK (player_count IN (2,3,4));
COMMENT ON COLUMN deckverse.rooms.player_count IS 'DeckVerse 2-, 3- or 4-player match size, chosen at room creation';

-- Original seat constraint was verified to be players_seat_check for deckverse.players.
-- No other schema or application is affected.
ALTER TABLE deckverse.players DROP CONSTRAINT IF EXISTS players_seat_check;
ALTER TABLE deckverse.players ADD CONSTRAINT players_seat_check CHECK (seat BETWEEN 0 AND 3);

-- Current role grants and RLS policies are intentionally retained.
-- Run Supabase security/performance advisors after applying, and never deploy
-- 3/4-player UI before migration has been verified on this schema only.
