-- Learning Marketplace V2 additive indexes
-- Safe to run multiple times.

SET @idx_leads_source_created = (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'learning_leads'
    AND index_name = 'idx_learning_leads_source_created'
);
SET @sql_leads_source_created = IF(
  @idx_leads_source_created = 0,
  'ALTER TABLE learning_leads ADD INDEX idx_learning_leads_source_created (source, created_at)',
  'SELECT 1'
);
PREPARE stmt_leads_source_created FROM @sql_leads_source_created;
EXECUTE stmt_leads_source_created;
DEALLOCATE PREPARE stmt_leads_source_created;

SET @idx_courses_featured_published_created = (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'learning_courses'
    AND index_name = 'idx_learning_courses_featured_published_created'
);
SET @sql_courses_featured_published_created = IF(
  @idx_courses_featured_published_created = 0,
  'ALTER TABLE learning_courses ADD INDEX idx_learning_courses_featured_published_created (featured, published_at, created_at)',
  'SELECT 1'
);
PREPARE stmt_courses_featured_published_created FROM @sql_courses_featured_published_created;
EXECUTE stmt_courses_featured_published_created;
DEALLOCATE PREPARE stmt_courses_featured_published_created;

SET @idx_enrollments_user_status_enrolled = (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'learning_enrollments'
    AND index_name = 'idx_learning_enrollments_user_status_enrolled'
);
SET @sql_enrollments_user_status_enrolled = IF(
  @idx_enrollments_user_status_enrolled = 0,
  'ALTER TABLE learning_enrollments ADD INDEX idx_learning_enrollments_user_status_enrolled (user_id, status, enrolled_at)',
  'SELECT 1'
);
PREPARE stmt_enrollments_user_status_enrolled FROM @sql_enrollments_user_status_enrolled;
EXECUTE stmt_enrollments_user_status_enrolled;
DEALLOCATE PREPARE stmt_enrollments_user_status_enrolled;
