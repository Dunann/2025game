-- Every existing attempt allowed exponentiation, including unfinished attempts.
ALTER TABLE runs ADD COLUMN exponentiation_enabled boolean NOT NULL DEFAULT true;
-- Keep this default for an old server still inserting during a rolling deploy.
-- New writers always supply the flag explicitly, including the new false default.

-- This is a new opt-in preference; existing players have not opted in.
ALTER TABLE settings ADD COLUMN exponentiation_enabled boolean NOT NULL DEFAULT false;
