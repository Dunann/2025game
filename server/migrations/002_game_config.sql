ALTER TABLE settings
  ADD COLUMN card_count smallint NOT NULL DEFAULT 8 CHECK (card_count BETWEEN 2 AND 52),
  ADD COLUMN target text NOT NULL DEFAULT '2025'
    CHECK (length(target) BETWEEN 1 AND 1234 AND target ~ '^[1-9][0-9]*$');

ALTER TABLE runs
  ADD COLUMN card_count smallint NOT NULL DEFAULT 8 CHECK (card_count BETWEEN 2 AND 52),
  ADD COLUMN target text NOT NULL DEFAULT '2025'
    CHECK (length(target) BETWEEN 1 AND 1234 AND target ~ '^[1-9][0-9]*$');
