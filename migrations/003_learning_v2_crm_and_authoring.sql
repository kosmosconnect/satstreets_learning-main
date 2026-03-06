-- Learning V2 CRM + Authoring schema updates
-- Safe to run multiple times.

-- ----------------------------
-- learning_leads additions
-- ----------------------------
SET @col_leads_instructor_user_id = (
  SELECT COUNT(1)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'learning_leads'
    AND column_name = 'instructor_user_id'
);
SET @sql_leads_instructor_user_id = IF(
  @col_leads_instructor_user_id = 0,
  'ALTER TABLE learning_leads ADD COLUMN instructor_user_id INT NULL AFTER course_id',
  'SELECT 1'
);
PREPARE stmt_leads_instructor_user_id FROM @sql_leads_instructor_user_id;
EXECUTE stmt_leads_instructor_user_id;
DEALLOCATE PREPARE stmt_leads_instructor_user_id;

SET @col_leads_lead_status = (
  SELECT COUNT(1)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'learning_leads'
    AND column_name = 'lead_status'
);
SET @sql_leads_lead_status = IF(
  @col_leads_lead_status = 0,
  "ALTER TABLE learning_leads ADD COLUMN lead_status ENUM('requested','contacted','qualified','enrolled','closed') NOT NULL DEFAULT 'requested' AFTER source",
  'SELECT 1'
);
PREPARE stmt_leads_lead_status FROM @sql_leads_lead_status;
EXECUTE stmt_leads_lead_status;
DEALLOCATE PREPARE stmt_leads_lead_status;

SET @col_leads_follow_up_at = (
  SELECT COUNT(1)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'learning_leads'
    AND column_name = 'follow_up_at'
);
SET @sql_leads_follow_up_at = IF(
  @col_leads_follow_up_at = 0,
  'ALTER TABLE learning_leads ADD COLUMN follow_up_at DATETIME NULL AFTER lead_status',
  'SELECT 1'
);
PREPARE stmt_leads_follow_up_at FROM @sql_leads_follow_up_at;
EXECUTE stmt_leads_follow_up_at;
DEALLOCATE PREPARE stmt_leads_follow_up_at;

SET @col_leads_last_contacted_at = (
  SELECT COUNT(1)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'learning_leads'
    AND column_name = 'last_contacted_at'
);
SET @sql_leads_last_contacted_at = IF(
  @col_leads_last_contacted_at = 0,
  'ALTER TABLE learning_leads ADD COLUMN last_contacted_at DATETIME NULL AFTER follow_up_at',
  'SELECT 1'
);
PREPARE stmt_leads_last_contacted_at FROM @sql_leads_last_contacted_at;
EXECUTE stmt_leads_last_contacted_at;
DEALLOCATE PREPARE stmt_leads_last_contacted_at;

SET @col_leads_status_note = (
  SELECT COUNT(1)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'learning_leads'
    AND column_name = 'status_note'
);
SET @sql_leads_status_note = IF(
  @col_leads_status_note = 0,
  'ALTER TABLE learning_leads ADD COLUMN status_note TEXT NULL AFTER message',
  'SELECT 1'
);
PREPARE stmt_leads_status_note FROM @sql_leads_status_note;
EXECUTE stmt_leads_status_note;
DEALLOCATE PREPARE stmt_leads_status_note;

SET @col_leads_updated_at = (
  SELECT COUNT(1)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'learning_leads'
    AND column_name = 'updated_at'
);
SET @sql_leads_updated_at = IF(
  @col_leads_updated_at = 0,
  'ALTER TABLE learning_leads ADD COLUMN updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at',
  'SELECT 1'
);
PREPARE stmt_leads_updated_at FROM @sql_leads_updated_at;
EXECUTE stmt_leads_updated_at;
DEALLOCATE PREPARE stmt_leads_updated_at;

UPDATE learning_leads l
JOIN learning_courses c ON c.id = l.course_id
SET l.instructor_user_id = c.instructor_user_id
WHERE l.instructor_user_id IS NULL;

-- ----------------------------
-- learning_courses additions
-- ----------------------------
SET @col_courses_delivery_mode = (
  SELECT COUNT(1)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'learning_courses'
    AND column_name = 'delivery_mode'
);
SET @sql_courses_delivery_mode = IF(
  @col_courses_delivery_mode = 0,
  "ALTER TABLE learning_courses ADD COLUMN delivery_mode ENUM('online','offline','hybrid') NOT NULL DEFAULT 'online' AFTER language",
  'SELECT 1'
);
PREPARE stmt_courses_delivery_mode FROM @sql_courses_delivery_mode;
EXECUTE stmt_courses_delivery_mode;
DEALLOCATE PREPARE stmt_courses_delivery_mode;

SET @col_courses_org_name = (
  SELECT COUNT(1)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'learning_courses'
    AND column_name = 'organization_name'
);
SET @sql_courses_org_name = IF(
  @col_courses_org_name = 0,
  'ALTER TABLE learning_courses ADD COLUMN organization_name VARCHAR(255) NULL AFTER preview_video',
  'SELECT 1'
);
PREPARE stmt_courses_org_name FROM @sql_courses_org_name;
EXECUTE stmt_courses_org_name;
DEALLOCATE PREPARE stmt_courses_org_name;

SET @col_courses_org_email = (
  SELECT COUNT(1)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'learning_courses'
    AND column_name = 'organization_email'
);
SET @sql_courses_org_email = IF(
  @col_courses_org_email = 0,
  'ALTER TABLE learning_courses ADD COLUMN organization_email VARCHAR(255) NULL AFTER organization_name',
  'SELECT 1'
);
PREPARE stmt_courses_org_email FROM @sql_courses_org_email;
EXECUTE stmt_courses_org_email;
DEALLOCATE PREPARE stmt_courses_org_email;

SET @col_courses_org_phone = (
  SELECT COUNT(1)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'learning_courses'
    AND column_name = 'organization_phone'
);
SET @sql_courses_org_phone = IF(
  @col_courses_org_phone = 0,
  'ALTER TABLE learning_courses ADD COLUMN organization_phone VARCHAR(30) NULL AFTER organization_email',
  'SELECT 1'
);
PREPARE stmt_courses_org_phone FROM @sql_courses_org_phone;
EXECUTE stmt_courses_org_phone;
DEALLOCATE PREPARE stmt_courses_org_phone;

SET @col_courses_org_website = (
  SELECT COUNT(1)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'learning_courses'
    AND column_name = 'organization_website'
);
SET @sql_courses_org_website = IF(
  @col_courses_org_website = 0,
  'ALTER TABLE learning_courses ADD COLUMN organization_website VARCHAR(500) NULL AFTER organization_phone',
  'SELECT 1'
);
PREPARE stmt_courses_org_website FROM @sql_courses_org_website;
EXECUTE stmt_courses_org_website;
DEALLOCATE PREPARE stmt_courses_org_website;

SET @col_courses_custom_category = (
  SELECT COUNT(1)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'learning_courses'
    AND column_name = 'custom_category'
);
SET @sql_courses_custom_category = IF(
  @col_courses_custom_category = 0,
  'ALTER TABLE learning_courses ADD COLUMN custom_category VARCHAR(255) NULL AFTER category_id',
  'SELECT 1'
);
PREPARE stmt_courses_custom_category FROM @sql_courses_custom_category;
EXECUTE stmt_courses_custom_category;
DEALLOCATE PREPARE stmt_courses_custom_category;

-- ----------------------------
-- learning_lessons additions
-- ----------------------------
SET @col_lessons_reference_image = (
  SELECT COUNT(1)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'learning_lessons'
    AND column_name = 'reference_image_url'
);
SET @sql_lessons_reference_image = IF(
  @col_lessons_reference_image = 0,
  'ALTER TABLE learning_lessons ADD COLUMN reference_image_url VARCHAR(500) NULL AFTER attachment_url',
  'SELECT 1'
);
PREPARE stmt_lessons_reference_image FROM @sql_lessons_reference_image;
EXECUTE stmt_lessons_reference_image;
DEALLOCATE PREPARE stmt_lessons_reference_image;

SET @lesson_type_has_document = (
  SELECT COUNT(1)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'learning_lessons'
    AND column_name = 'type'
    AND column_type LIKE "%'document'%"
);
SET @sql_lessons_enum_document = IF(
  @lesson_type_has_document = 0,
  "ALTER TABLE learning_lessons MODIFY COLUMN type ENUM('video','text','quiz','assignment','pdf','document') DEFAULT 'video'",
  'SELECT 1'
);
PREPARE stmt_lessons_enum_document FROM @sql_lessons_enum_document;
EXECUTE stmt_lessons_enum_document;
DEALLOCATE PREPARE stmt_lessons_enum_document;

-- ----------------------------
-- Indexes
-- ----------------------------
SET @idx_leads_instructor_status_created = (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'learning_leads'
    AND index_name = 'idx_learning_leads_instructor_status_created'
);
SET @sql_idx_leads_instructor_status_created = IF(
  @idx_leads_instructor_status_created = 0,
  'ALTER TABLE learning_leads ADD INDEX idx_learning_leads_instructor_status_created (instructor_user_id, lead_status, created_at)',
  'SELECT 1'
);
PREPARE stmt_idx_leads_instructor_status_created FROM @sql_idx_leads_instructor_status_created;
EXECUTE stmt_idx_leads_instructor_status_created;
DEALLOCATE PREPARE stmt_idx_leads_instructor_status_created;

SET @idx_leads_email_created = (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'learning_leads'
    AND index_name = 'idx_learning_leads_email_created'
);
SET @sql_idx_leads_email_created = IF(
  @idx_leads_email_created = 0,
  'ALTER TABLE learning_leads ADD INDEX idx_learning_leads_email_created (email, created_at)',
  'SELECT 1'
);
PREPARE stmt_idx_leads_email_created FROM @sql_idx_leads_email_created;
EXECUTE stmt_idx_leads_email_created;
DEALLOCATE PREPARE stmt_idx_leads_email_created;
