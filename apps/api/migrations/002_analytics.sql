CREATE TABLE analytics_settings (
  event_id TEXT PRIMARY KEY REFERENCES events(id),
  entrance_gate_id TEXT REFERENCES gates(id),
  updated_at TEXT NOT NULL
);
CREATE TABLE analytics_gate_targets (
  gate_id TEXT PRIMARY KEY REFERENCES gates(id),
  target_percent REAL NOT NULL CHECK(target_percent>=0 AND target_percent<=100)
);
CREATE INDEX scans_event_participant ON scans(event_id,participant_id);
CREATE INDEX collections_gate_time ON collections(gate_id,created_at);
