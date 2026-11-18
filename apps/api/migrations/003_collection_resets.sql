CREATE TABLE participant_gate_revisions (
 participant_id TEXT NOT NULL REFERENCES participants(id),
 gate_id TEXT NOT NULL REFERENCES gates(id),
 revision INTEGER NOT NULL CHECK(revision>=1),
 reset_at TEXT NOT NULL,
 PRIMARY KEY(participant_id,gate_id)
);
-- Older undos also reopen inventory. Legacy queued captures must not revive them.
INSERT INTO participant_gate_revisions(participant_id,gate_id,revision,reset_at)
SELECT participant_id,gate_id,count(*),max(undone_at)
FROM collections WHERE undone_at IS NOT NULL GROUP BY participant_id,gate_id;
CREATE TABLE collection_resets (
 id TEXT PRIMARY KEY,
 event_id TEXT NOT NULL REFERENCES events(id),
 participant_id TEXT NOT NULL REFERENCES participants(id),
 gate_id TEXT NOT NULL REFERENCES gates(id),
 mode TEXT NOT NULL CHECK(mode IN ('one','all')),
 request_hash TEXT NOT NULL,
 revision INTEGER NOT NULL,
 actor_id TEXT NOT NULL REFERENCES admins(id),
 reason TEXT NOT NULL,
 created_at TEXT NOT NULL,
 result_json TEXT NOT NULL
);
CREATE TABLE collection_reset_items (
 reset_id TEXT NOT NULL REFERENCES collection_resets(id),
 collection_id TEXT NOT NULL UNIQUE REFERENCES collections(id),
 PRIMARY KEY(reset_id,collection_id)
);
CREATE INDEX collection_resets_participant ON collection_resets(event_id,participant_id,created_at);
