CREATE INDEX batch_member_user ON batch_members(user_id, batch_id);
CREATE INDEX batch_process ON batches(process_id);
CREATE INDEX scenario_process_updated ON scenarios(process_id, updated_at DESC);
CREATE INDEX assignment_version ON assignments(scenario_version_id);
CREATE INDEX attempt_user_started ON attempts(user_id, started_at DESC);
