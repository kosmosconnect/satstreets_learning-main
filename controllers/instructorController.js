import db from '../config/db.js';
import { generateCertificate } from './certificateController.js';

const parseJsonSafe = (value, fallback) => {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch (_) {
      return fallback;
    }
  }
  return fallback;
};

const VALID_LEAD_STATUSES = new Set(['requested', 'contacted', 'qualified', 'enrolled', 'closed']);

// GET /api/learning/instructor/courses - Get instructor's courses (Pro tier)
export const getInstructorCourses = async (req, res) => {
  try {
    const userId = req.user.profile_id || req.user.id;
    const { page = 1, limit = 20, status } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    let whereConditions = ['instructor_user_id = ?'];
    let params = [userId];

    if (status) {
      whereConditions.push('status = ?');
      params.push(status);
    }

    const whereClause = whereConditions.join(' AND ');

    // Get total count
    const [countResult] = await db.query(
      `SELECT COUNT(*) as total FROM learning_courses WHERE ${whereClause}`,
      params
    );
    const total = countResult[0].total;

    // Get courses
    const [courses] = await db.query(`
      SELECT 
        id, title, slug, short_description, thumbnail, level,
        price, currency, is_free, duration_hours, total_chapters,
        total_lessons, status, featured, enrollment_count,
        avg_rating, published_at, created_at, updated_at,
        delivery_mode, custom_category, preview_video,
        organization_name, organization_email, organization_phone, organization_website
      FROM learning_courses
      WHERE ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `, [...params, parseInt(limit), offset]);

    res.json({
      status: 1,
      message: 'Instructor courses retrieved successfully',
      data: {
        courses,
        pagination: {
          current_page: parseInt(page),
          per_page: parseInt(limit),
          total,
          total_pages: Math.ceil(total / parseInt(limit))
        }
      }
    });

  } catch (error) {
    console.error('Error in getInstructorCourses:', error);
    res.status(500).json({
      status: 0,
      message: 'Failed to retrieve instructor courses'
    });
  }
};

// GET /api/learning/instructor/courses/:id - Get full course detail for owner
export const getInstructorCourseById = async (req, res) => {
  try {
    const userId = req.user.profile_id || req.user.id;
    const { id } = req.params;

    const [ownershipRows] = await db.query(
      'SELECT id, instructor_user_id FROM learning_courses WHERE id = ?',
      [id]
    );

    if (!ownershipRows.length) {
      return res.status(404).json({
        status: 0,
        message: 'Course not found'
      });
    }

    if (ownershipRows[0].instructor_user_id !== userId) {
      return res.status(403).json({
        status: 0,
        message: 'Access denied'
      });
    }

    const [courseRows] = await db.query(
      `SELECT
        id, title, slug, description, short_description, thumbnail, preview_video,
        category_id, custom_category, level, language, delivery_mode, price, currency, is_free, duration_hours,
        tags, prerequisites, learning_outcomes,
        organization_name, organization_email, organization_phone, organization_website,
        status, featured,
        enrollment_count, avg_rating, published_at, created_at, updated_at
      FROM learning_courses
      WHERE id = ?`,
      [id]
    );

    const [chapterRows] = await db.query(
      `SELECT
        ch.id, ch.title, ch.description, ch.sort_order, ch.is_free_preview,
        (
          SELECT JSON_ARRAYAGG(
            JSON_OBJECT(
              'id', l.id,
              'title', l.title,
              'type', l.type,
              'content', l.content,
              'video_url', l.video_url,
              'video_duration', l.video_duration,
              'attachment_url', l.attachment_url,
              'reference_image_url', l.reference_image_url,
              'sort_order', l.sort_order,
              'is_free_preview', l.is_free_preview
            )
          )
          FROM learning_lessons l
          WHERE l.chapter_id = ch.id
          ORDER BY l.sort_order
        ) AS lessons
      FROM learning_chapters ch
      WHERE ch.course_id = ?
      ORDER BY ch.sort_order`,
      [id]
    );

    const course = courseRows[0];
    return res.json({
      status: 1,
      message: 'Instructor course retrieved successfully',
      data: {
        ...course,
        tags: parseJsonSafe(course.tags, []),
        chapters: chapterRows.map((chapter) => ({
          ...chapter,
          lessons: parseJsonSafe(chapter.lessons, [])
        }))
      }
    });
  } catch (error) {
    console.error('Error in getInstructorCourseById:', error);
    return res.status(500).json({
      status: 0,
      message: 'Failed to retrieve course'
    });
  }
};

// GET /api/learning/instructor/analytics - Get instructor analytics (Pro tier)
export const getInstructorAnalytics = async (req, res) => {
  try {
    const userId = req.user.profile_id || req.user.id;

    // Get course stats
    const [courseStats] = await db.query(`
      SELECT 
        COUNT(*) as total_courses,
        SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) as published_courses,
        SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) as draft_courses,
        SUM(enrollment_count) as total_enrollments,
        AVG(avg_rating) as avg_rating
      FROM learning_courses
      WHERE instructor_user_id = ?
    `, [userId]);

    // Get enrollment trends (last 30 days)
    const [enrollmentTrends] = await db.query(`
      SELECT 
        DATE(e.enrolled_at) as date,
        COUNT(*) as enrollments
      FROM learning_enrollments e
      JOIN learning_courses c ON e.course_id = c.id
      WHERE c.instructor_user_id = ? 
        AND e.enrolled_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      GROUP BY DATE(e.enrolled_at)
      ORDER BY date DESC
    `, [userId]);

    // Get recent enrollments
    const [recentEnrollments] = await db.query(`
      SELECT 
        e.id, e.enrolled_at, e.progress_pct,
        c.title as course_title, c.slug as course_slug,
        u.display_name as student_name, u.email as student_email
      FROM learning_enrollments e
      JOIN learning_courses c ON e.course_id = c.id
      JOIN users u ON e.user_id = u.id
      WHERE c.instructor_user_id = ?
      ORDER BY e.enrolled_at DESC
      LIMIT 10
    `, [userId]);

    res.json({
      status: 1,
      message: 'Instructor analytics retrieved successfully',
      data: {
        stats: courseStats[0],
        enrollment_trends: enrollmentTrends,
        recent_enrollments: recentEnrollments
      }
    });

  } catch (error) {
    console.error('Error in getInstructorAnalytics:', error);
    res.status(500).json({
      status: 0,
      message: 'Failed to retrieve instructor analytics'
    });
  }
};

// GET /api/learning/instructor/leads - Instructor-owned lead CRM list
export const getInstructorLeads = async (req, res) => {
  try {
    const userId = req.user.profile_id || req.user.id;
    const { page = 1, limit = 20, course_id, status } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const conditions = ['l.instructor_user_id = ?'];
    const params = [userId];

    if (course_id) {
      conditions.push('l.course_id = ?');
      params.push(Number(course_id));
    }

    const normalizedStatus = status ? String(status).trim().toLowerCase() : '';
    if (normalizedStatus && VALID_LEAD_STATUSES.has(normalizedStatus)) {
      conditions.push('l.lead_status = ?');
      params.push(normalizedStatus);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const [countRows] = await db.query(
      `SELECT COUNT(*) as total
       FROM learning_leads l
       ${whereClause}`,
      params
    );
    const total = Number(countRows[0]?.total || 0);

    const [rows] = await db.query(
      `SELECT
        l.id, l.course_id, l.name, l.email, l.phone, l.company_name, l.message,
        l.source, l.lead_status, l.follow_up_at, l.last_contacted_at,
        l.status_note, l.created_at, l.updated_at,
        c.title as course_title, c.slug as course_slug
       FROM learning_leads l
       JOIN learning_courses c ON c.id = l.course_id
       ${whereClause}
       ORDER BY l.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );

    return res.json({
      status: 1,
      message: 'Instructor leads retrieved successfully',
      data: {
        leads: rows,
        pagination: {
          current_page: parseInt(page),
          per_page: parseInt(limit),
          total,
          total_pages: Math.ceil(total / parseInt(limit)),
        },
      },
    });
  } catch (error) {
    console.error('Error in getInstructorLeads:', error);
    return res.status(500).json({
      status: 0,
      message: 'Failed to retrieve instructor leads'
    });
  }
};

// PUT /api/learning/instructor/leads/:id/status - update lead lifecycle status
export const updateInstructorLeadStatus = async (req, res) => {
  try {
    const userId = req.user.profile_id || req.user.id;
    const { id } = req.params;
    const { lead_status, status_note, follow_up_at } = req.body;
    const normalizedStatus = String(lead_status || '').trim().toLowerCase();

    if (!VALID_LEAD_STATUSES.has(normalizedStatus)) {
      return res.status(400).json({
        status: 0,
        message: 'Invalid lead status'
      });
    }

    const [rows] = await db.query(
      `SELECT id
       FROM learning_leads
       WHERE id = ? AND instructor_user_id = ?
       LIMIT 1`,
      [id, userId]
    );

    if (!rows.length) {
      return res.status(404).json({
        status: 0,
        message: 'Lead not found'
      });
    }

    const followUpDate =
      follow_up_at == null || String(follow_up_at).trim() === ''
        ? null
        : new Date(follow_up_at);
    const followUpValue =
      followUpDate && !Number.isNaN(followUpDate.getTime())
        ? followUpDate
        : null;

    const shouldMarkContacted = normalizedStatus !== 'requested';
    await db.query(
      `UPDATE learning_leads
       SET lead_status = ?,
           status_note = ?,
           follow_up_at = ?,
           last_contacted_at = ?,
           updated_at = NOW()
       WHERE id = ? AND instructor_user_id = ?`,
      [
        normalizedStatus,
        status_note ? String(status_note).trim() : null,
        followUpValue,
        shouldMarkContacted ? new Date() : null,
        id,
        userId
      ]
    );

    return res.json({
      status: 1,
      message: 'Lead status updated successfully'
    });
  } catch (error) {
    console.error('Error in updateInstructorLeadStatus:', error);
    return res.status(500).json({
      status: 0,
      message: 'Failed to update lead status'
    });
  }
};

// GET /api/learning/instructor/courses/:id/participants - learner roster + certificate state
export const getCourseParticipants = async (req, res) => {
  try {
    const userId = req.user.profile_id || req.user.id;
    const { id } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const [courseRows] = await db.query(
      'SELECT id, title FROM learning_courses WHERE id = ? AND instructor_user_id = ? LIMIT 1',
      [id, userId]
    );

    if (!courseRows.length) {
      return res.status(404).json({
        status: 0,
        message: 'Course not found'
      });
    }

    const [countRows] = await db.query(
      'SELECT COUNT(*) as total FROM learning_enrollments WHERE course_id = ?',
      [id]
    );
    const total = Number(countRows[0]?.total || 0);

    const [participants] = await db.query(
      `SELECT
        e.id as enrollment_id,
        e.user_id,
        e.status as enrollment_status,
        e.progress_pct,
        e.enrolled_at,
        e.completed_at,
        u.display_name as learner_name,
        u.email as learner_email,
        cert.id as certificate_id,
        cert.certificate_number,
        cert.issued_at,
        cert.pdf_url
       FROM learning_enrollments e
       JOIN users u ON u.id = e.user_id
       LEFT JOIN learning_certificates cert
         ON cert.user_id = e.user_id AND cert.course_id = e.course_id
       WHERE e.course_id = ?
       ORDER BY e.enrolled_at DESC
       LIMIT ? OFFSET ?`,
      [id, parseInt(limit), offset]
    );

    return res.json({
      status: 1,
      message: 'Course participants retrieved successfully',
      data: {
        course: courseRows[0],
        participants,
        pagination: {
          current_page: parseInt(page),
          per_page: parseInt(limit),
          total,
          total_pages: Math.ceil(total / parseInt(limit)),
        },
      }
    });
  } catch (error) {
    console.error('Error in getCourseParticipants:', error);
    return res.status(500).json({
      status: 0,
      message: 'Failed to retrieve participants'
    });
  }
};

// POST /api/learning/instructor/courses/:id/certificates/issue - manual issue/reissue
export const issueCourseCertificate = async (req, res) => {
  try {
    const userId = req.user.profile_id || req.user.id;
    const { id } = req.params;
    const participantId = Number(req.body?.user_id);

    if (!participantId || Number.isNaN(participantId)) {
      return res.status(400).json({
        status: 0,
        message: 'user_id is required'
      });
    }

    const [courseRows] = await db.query(
      'SELECT id, title FROM learning_courses WHERE id = ? AND instructor_user_id = ? LIMIT 1',
      [id, userId]
    );
    if (!courseRows.length) {
      return res.status(404).json({
        status: 0,
        message: 'Course not found'
      });
    }

    const [enrollmentRows] = await db.query(
      `SELECT id, progress_pct, status
       FROM learning_enrollments
       WHERE course_id = ? AND user_id = ?
       LIMIT 1`,
      [id, participantId]
    );
    if (!enrollmentRows.length) {
      return res.status(404).json({
        status: 0,
        message: 'Participant is not enrolled in this course'
      });
    }

    const enrollment = enrollmentRows[0];
    const progress = Number(enrollment.progress_pct || 0);
    if (progress < 100 && String(enrollment.status || '').toLowerCase() !== 'completed') {
      return res.status(400).json({
        status: 0,
        message: 'Certificate can be issued only after 100% completion'
      });
    }

    const certificateId = await generateCertificate(participantId, Number(id));
    await db.query(
      'UPDATE learning_certificates SET issued_at = NOW() WHERE id = ?',
      [certificateId]
    );

    const [certificateRows] = await db.query(
      `SELECT id, certificate_number, issued_at, pdf_url
       FROM learning_certificates
       WHERE id = ?
       LIMIT 1`,
      [certificateId]
    );

    return res.json({
      status: 1,
      message: 'Certificate assigned successfully',
      data: {
        course_id: Number(id),
        user_id: participantId,
        certificate: certificateRows[0] || null
      }
    });
  } catch (error) {
    console.error('Error in issueCourseCertificate:', error);
    return res.status(500).json({
      status: 0,
      message: 'Failed to assign certificate'
    });
  }
};
