-- Speeds up analytics/history queries that filter or sort set_timings by
-- created_at (previously unindexed, forcing a full-table scan as the table
-- grows).
ALTER TABLE set_timings ADD INDEX idx_st_created_at (created_at);
