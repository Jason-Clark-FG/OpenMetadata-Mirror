-- Task System Redesign - Post Data Migration
-- This script migrates existing tasks from thread_entity to task_entity
-- Note: The actual Java migration logic handles complex transformations

-- Mark this migration as handled by Java migration code
-- The TaskMigrationJob Java class will:
-- 1. Migrate ALL tasks (open + closed) from thread_entity
-- 2. Migrate ALL suggestions to new Task-based system
-- 3. Generate task_id sequence (TASK-XXXXX)
-- 4. Map old thread IDs to new task IDs (for URL redirects)

-- This SQL script handles simpler cleanup operations

-- No direct SQL migration needed - handled by Java TaskMigrationJob
SELECT 'Task migration handled by Java TaskMigrationJob - see MigrationTaskSystemRedesign.java' as migration_note;
