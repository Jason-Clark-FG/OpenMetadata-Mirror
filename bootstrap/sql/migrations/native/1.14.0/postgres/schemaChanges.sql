ALTER TABLE workflow_instance_time_series
    ADD COLUMN scheduleRunId VARCHAR(36)
    GENERATED ALWAYS AS ((json ->> 'scheduleRunId')) STORED;
CREATE INDEX idx_workflow_instance_schedule_run_id
    ON workflow_instance_time_series (scheduleRunId);

ALTER TABLE workflow_instance_state_time_series
    ADD COLUMN scheduleRunId VARCHAR(36)
    GENERATED ALWAYS AS ((json ->> 'scheduleRunId')) STORED;
CREATE INDEX idx_workflow_instance_state_schedule_run_id
    ON workflow_instance_state_time_series (scheduleRunId);
