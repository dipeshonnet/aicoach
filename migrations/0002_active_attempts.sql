CREATE UNIQUE INDEX active_attempt_per_channel ON attempts(assignment_id,user_id,mode,channel) WHERE status='active';
