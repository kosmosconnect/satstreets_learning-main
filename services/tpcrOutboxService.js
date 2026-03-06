import db from "../config/db.js";

export const ensureTPCRLearningOutboxTable = async () => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS tpcr_event_outbox (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      event_source ENUM('core','jobs','learning','compliance','tpcr') NOT NULL DEFAULT 'core',
      event_type VARCHAR(120) NOT NULL,
      company_id INT NULL,
      domain_id INT NULL,
      payload JSON NULL,
      status ENUM('pending','processing','processed','failed') NOT NULL DEFAULT 'pending',
      attempts INT NOT NULL DEFAULT 0,
      available_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_error TEXT NULL,
      processed_at DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_status_available (status, available_at),
      INDEX idx_company_created (company_id, created_at),
      INDEX idx_domain_created (domain_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
};

const toPositiveInt = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

export const resolveCompanyIdForUser = async (userId) => {
  const normalizedUserId = toPositiveInt(userId);
  if (!normalizedUserId) return null;

  const [teamMemberships] = await db.query(
    `SELECT company_id
     FROM team_members
     WHERE user_id = ?
       AND company_id IS NOT NULL
       AND deactivated_at IS NULL
     ORDER BY
       CASE WHEN status IN ('active', 'accepted') THEN 0 ELSE 1 END,
       id DESC
     LIMIT 1`,
    [normalizedUserId]
  );

  if (teamMemberships.length > 0) {
    return Number(teamMemberships[0].company_id);
  }

  const [ownedCompanies] = await db.query(
    "SELECT id FROM company WHERE user_id = ? ORDER BY id DESC LIMIT 1",
    [normalizedUserId]
  );

  if (ownedCompanies.length > 0) {
    return Number(ownedCompanies[0].id);
  }

  return null;
};

export const resolveCompanyIdFromCourseId = async (courseId) => {
  const normalizedCourseId = toPositiveInt(courseId);
  if (!normalizedCourseId) return null;

  const [rows] = await db.query(
    "SELECT company_id FROM learning_courses WHERE id = ? LIMIT 1",
    [normalizedCourseId]
  );

  if (!rows.length) return null;
  return toPositiveInt(rows[0].company_id);
};

export const resolveCompanyIdFromChapterId = async (chapterId) => {
  const normalizedChapterId = toPositiveInt(chapterId);
  if (!normalizedChapterId) return null;

  const [rows] = await db.query(
    `SELECT c.company_id
     FROM learning_chapters ch
     JOIN learning_courses c ON c.id = ch.course_id
     WHERE ch.id = ?
     LIMIT 1`,
    [normalizedChapterId]
  );

  if (!rows.length) return null;
  return toPositiveInt(rows[0].company_id);
};

export const resolveCompanyIdFromLessonId = async (lessonId) => {
  const normalizedLessonId = toPositiveInt(lessonId);
  if (!normalizedLessonId) return null;

  const [rows] = await db.query(
    `SELECT c.company_id
     FROM learning_lessons l
     JOIN learning_chapters ch ON ch.id = l.chapter_id
     JOIN learning_courses c ON c.id = ch.course_id
     WHERE l.id = ?
     LIMIT 1`,
    [normalizedLessonId]
  );

  if (!rows.length) return null;
  return toPositiveInt(rows[0].company_id);
};

export const queueTPCRLearningEvent = async ({
  eventType = "unknown",
  companyId = null,
  domainId = null,
  payload = null,
}) => {
  const normalizedCompanyId = toPositiveInt(companyId);
  const normalizedDomainId = toPositiveInt(domainId);

  await db.query(
    `INSERT INTO tpcr_event_outbox
      (event_source, event_type, company_id, domain_id, payload, status, available_at)
     VALUES ('learning', ?, ?, ?, ?, 'pending', NOW())`,
    [
      String(eventType || "unknown").slice(0, 120),
      normalizedCompanyId || null,
      normalizedDomainId || null,
      payload == null ? null : JSON.stringify(payload),
    ]
  );
};
