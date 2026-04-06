ALTER TABLE workflow_instance_time_series
    ADD COLUMN scheduleRunId VARCHAR(36)
    GENERATED ALWAYS AS (json ->> '$.scheduleRunId');
ALTER TABLE workflow_instance_time_series
    ADD INDEX idx_workflow_instance_schedule_run_id (scheduleRunId);

ALTER TABLE workflow_instance_state_time_series
    ADD COLUMN scheduleRunId VARCHAR(36)
    GENERATED ALWAYS AS (json ->> '$.scheduleRunId');
ALTER TABLE workflow_instance_state_time_series
    ADD INDEX idx_workflow_instance_state_schedule_run_id (scheduleRunId);
