import db from '../config/db.js';
import { generateCertificate } from './certificateController.js';
import { sendInstructorLeadEmail } from '../utils/leadEmailService.js';

// POST /api/learning/enrollments - Enroll in course (Free tier)
export const enrollInCourse = async (req, res) => {
  try {
    const userId = req.user.profile_id || req.user.id;
    const { course_id } = req.body;

    if (!course_id) {
      return res.status(400).json({
        status: 0,
        message: 'Course ID is required'
      });
    }

    // Check if course exists and is published
    const [courses] = await db.query(
      `SELECT
        c.id, c.title, c.slug, c.price, c.is_free, c.instructor_user_id,
        instr.display_name as instructor_name,
        instr.email as instructor_email
       FROM learning_courses c
       LEFT JOIN users instr ON instr.id = c.instructor_user_id
       WHERE c.id = ? AND c.status = ?`,
      [course_id, 'published']
    );

    if (courses.length === 0) {
      return res.status(404).json({
        status: 0,
        message: 'Course not found'
      });
    }

    const course = courses[0];

    // Check if already enrolled
    const [existing] = await db.query(
      'SELECT id FROM learning_enrollments WHERE user_id = ? AND course_id = ?',
      [userId, course_id]
    );

    if (existing.length > 0) {
      return res.status(400).json({
        status: 0,
        message: 'Already enrolled in this course'
      });
    }

    // For this release, paid courses route through lead capture/contact sales.
    if (!course.is_free && course.price > 0) {
      const [users] = await db.query(
        'SELECT display_name, first_name, last_name, email, phone FROM users WHERE id = ? LIMIT 1',
        [userId]
      );

      const user = users[0] || {};
      const leadName =
        user.display_name ||
        [user.first_name, user.last_name].filter(Boolean).join(' ').trim() ||
        null;
      const leadEmail = user.email || null;
      let leadCaptured = false;

      if (leadEmail) {
        await db.query(
          `INSERT INTO learning_leads
           (course_id, instructor_user_id, name, email, phone, message, source, lead_status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 'paid_enroll_gate', 'requested', NOW(), NOW())`,
          [
            course.id,
            course.instructor_user_id || null,
            leadName,
            leadEmail,
            user.phone || null,
            'Paid course interest captured via enrollment gate'
          ]
        );
        leadCaptured = true;

        void sendInstructorLeadEmail({
          instructorEmail: course.instructor_email,
          instructorName: course.instructor_name,
          courseTitle: course.title,
          courseSlug: course.slug,
          leadSource: 'paid_enroll_gate',
          leadName,
          leadEmail,
          leadPhone: user.phone || null,
          leadCompany: null,
          leadMessage: 'Paid course interest captured via enrollment gate',
        });
      }

      return res.status(402).json({
        status: 0,
        message: 'Paid enrollment request submitted. The instructor will connect with you soon.',
        data: {
          lead_capture_required: true,
          lead_captured: leadCaptured,
          course_id: course.id,
          course_slug: course.slug
        }
      });
    }

    // Create enrollment
    const [result] = await db.query(`
      INSERT INTO learning_enrollments (
        user_id, course_id, status, enrolled_at
      ) VALUES (?, ?, 'active', NOW())
    `, [userId, course_id]);

    // Update course enrollment count
    await db.query(
      'UPDATE learning_courses SET enrollment_count = enrollment_count + 1 WHERE id = ?',
      [course_id]
    );

    res.status(201).json({
      status: 1,
      message: 'Successfully enrolled in course',
      data: {
        enrollment_id: result.insertId,
        course_title: course.title
      }
    });

  } catch (error) {
    console.error('Error in enrollInCourse:', error);
    res.status(500).json({
      status: 0,
      message: 'Failed to enroll in course'
    });
  }
};

// GET /api/learning/enrollments/my-courses - Get my enrolled courses
export const getMyCourses = async (req, res) => {
  try {
    const userId = req.user.profile_id || req.user.id;
    const { page = 1, limit = 20, status = 'active' } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Get total count
    const [countResult] = await db.query(
      'SELECT COUNT(*) as total FROM learning_enrollments WHERE user_id = ? AND status = ?',
      [userId, status]
    );
    const total = countResult[0].total;

    // Get enrolled courses
    const [enrollments] = await db.query(`
      SELECT 
        e.id as enrollment_id, e.status, e.progress_pct, e.enrolled_at, e.completed_at,
        c.id as id, c.id as course_id, c.title, c.slug, c.short_description, c.thumbnail,
        c.level, c.duration_hours, c.total_chapters, c.total_lessons,
        c.avg_rating, c.published_at,
        cat.name as category_name,
        u.display_name as instructor_name,
        comp.name as company_name
      FROM learning_enrollments e
      JOIN learning_courses c ON e.course_id = c.id
      LEFT JOIN learning_categories cat ON c.category_id = cat.id
      LEFT JOIN users u ON c.instructor_user_id = u.id
      LEFT JOIN company comp ON c.company_id = comp.id
      WHERE e.user_id = ? AND e.status = ?
      ORDER BY e.enrolled_at DESC
      LIMIT ? OFFSET ?
    `, [userId, status, parseInt(limit), offset]);

    // Get lesson progress for each course
    for (let enrollment of enrollments) {
      const [progressResult] = await db.query(`
        SELECT 
          COUNT(*) as total_lessons,
          SUM(CASE WHEN lp.completed = 1 THEN 1 ELSE 0 END) as completed_lessons
        FROM learning_lessons l
        LEFT JOIN learning_chapters ch ON l.chapter_id = ch.id
        LEFT JOIN learning_lesson_progress lp ON l.id = lp.lesson_id AND lp.user_id = ?
        WHERE ch.course_id = ?
      `, [userId, enrollment.course_id]);

      const progress = progressResult[0];
      enrollment.total_lessons = progress.total_lessons || 0;
      enrollment.completed_lessons = progress.completed_lessons || 0;
    }

    res.json({
      status: 1,
      message: 'Enrolled courses retrieved successfully',
      data: {
        courses: enrollments,
        pagination: {
          current_page: parseInt(page),
          per_page: parseInt(limit),
          total: total,
          total_pages: Math.ceil(total / parseInt(limit))
        }
      }
    });

  } catch (error) {
    console.error('Error in getMyCourses:', error);
    res.status(500).json({
      status: 0,
      message: 'Failed to retrieve enrolled courses'
    });
  }
};

// GET /api/learning/enrollments/my-requests - Get paid course requests captured as leads
export const getMyRequests = async (req, res) => {
  try {
    const userId = req.user.profile_id || req.user.id;
    const { page = 1, limit = 20, status } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const [userRows] = await db.query(
      'SELECT email FROM users WHERE id = ? LIMIT 1',
      [userId]
    );

    const userEmail = String(userRows[0]?.email || '').trim().toLowerCase();
    if (!userEmail) {
      return res.json({
        status: 1,
        message: 'Requested courses retrieved successfully',
        data: {
          requests: [],
          pagination: {
            current_page: parseInt(page),
            per_page: parseInt(limit),
            total: 0,
            total_pages: 0
          }
        }
      });
    }

    const statusFilter = status ? String(status).trim().toLowerCase() : null;
    const statusWhere = statusFilter ? 'WHERE latest.lead_status = ?' : '';
    const filterParams = statusFilter ? [statusFilter] : [];

    const [countRows] = await db.query(
      `SELECT COUNT(*) as total
       FROM (
         SELECT
           l.course_id,
           MAX(l.id) as id,
           SUBSTRING_INDEX(
             GROUP_CONCAT(l.lead_status ORDER BY l.id DESC SEPARATOR ','),
             ',',
             1
           ) as lead_status
         FROM learning_leads l
         WHERE LOWER(l.email) = ?
         GROUP BY l.course_id
       ) latest
       ${statusWhere}`,
      [userEmail, ...filterParams]
    );
    const total = Number(countRows[0]?.total || 0);

    const [rows] = await db.query(
      `SELECT
        latest.id,
        latest.course_id,
        latest.lead_status,
        latest.created_at,
        latest.updated_at,
        latest.follow_up_at,
        latest.last_contacted_at,
        latest.status_note,
        latest.source,
        c.title as course_title,
        c.slug as course_slug,
        c.short_description,
        c.thumbnail,
        c.level,
        c.duration_hours,
        c.price,
        c.currency,
        c.is_free,
        u.display_name as instructor_name
       FROM (
         SELECT
           l.id, l.course_id, l.lead_status, l.created_at, l.updated_at,
           l.follow_up_at, l.last_contacted_at, l.status_note, l.source
         FROM learning_leads l
         JOIN (
           SELECT course_id, MAX(id) as latest_id
           FROM learning_leads
           WHERE LOWER(email) = ?
           GROUP BY course_id
         ) latest_leads
           ON latest_leads.latest_id = l.id
       ) latest
       JOIN learning_courses c ON c.id = latest.course_id
       LEFT JOIN users u ON u.id = c.instructor_user_id
       ${statusWhere}
       ORDER BY latest.created_at DESC
       LIMIT ? OFFSET ?`,
      [userEmail, ...filterParams, parseInt(limit), offset]
    );

    return res.json({
      status: 1,
      message: 'Requested courses retrieved successfully',
      data: {
        requests: rows,
        pagination: {
          current_page: parseInt(page),
          per_page: parseInt(limit),
          total,
          total_pages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    console.error('Error in getMyRequests:', error);
    return res.status(500).json({
      status: 0,
      message: 'Failed to retrieve requested courses'
    });
  }
};

// GET /api/learning/enrollments/my-summary - Summary counts (enrolled + requested)
export const getMySummary = async (req, res) => {
  try {
    const userId = req.user.profile_id || req.user.id;
    const [statusRows] = await db.query(
      `SELECT status, COUNT(*) as count
       FROM learning_enrollments
       WHERE user_id = ?
       GROUP BY status`,
      [userId]
    );

    const [userRows] = await db.query(
      'SELECT email FROM users WHERE id = ? LIMIT 1',
      [userId]
    );
    const userEmail = String(userRows[0]?.email || '').trim().toLowerCase();

    let requestedCount = 0;
    if (userEmail) {
      const [requestCountRows] = await db.query(
        `SELECT COUNT(*) as total
         FROM (
           SELECT course_id
           FROM learning_leads
           WHERE LOWER(email) = ?
           GROUP BY course_id
         ) requested_courses`,
        [userEmail]
      );
      requestedCount = Number(requestCountRows[0]?.total || 0);
    }

    const summary = {
      active: 0,
      completed: 0,
      dropped: 0,
      requested: requestedCount,
    };

    for (const row of statusRows) {
      const key = String(row.status || '').toLowerCase();
      if (Object.prototype.hasOwnProperty.call(summary, key)) {
        summary[key] = Number(row.count || 0);
      }
    }

    return res.json({
      status: 1,
      message: 'Learning summary retrieved successfully',
      data: summary
    });
  } catch (error) {
    console.error('Error in getMySummary:', error);
    return res.status(500).json({
      status: 0,
      message: 'Failed to retrieve learning summary'
    });
  }
};

// PUT /api/learning/enrollments/lessons/:id/progress - Mark lesson progress
export const updateLessonProgress = async (req, res) => {
  try {
    const userId = req.user.profile_id || req.user.id;
    const { id: lessonId } = req.params;
    const { completed, watch_time } = req.body;

    if (completed === undefined) {
      return res.status(400).json({
        status: 0,
        message: 'Completed status is required'
      });
    }

    // Check if lesson exists and get course info
    const [lessons] = await db.query(`
      SELECT l.id, l.course_id, ch.course_id as chapter_course_id
      FROM learning_lessons l
      JOIN learning_chapters ch ON l.chapter_id = ch.id
      WHERE l.id = ?
    `, [lessonId]);

    if (lessons.length === 0) {
      return res.status(404).json({
        status: 0,
        message: 'Lesson not found'
      });
    }

    const courseId = lessons[0].course_id;

    // Check if user is enrolled
    const [enrollment] = await db.query(
      'SELECT id FROM learning_enrollments WHERE user_id = ? AND course_id = ? AND status = ?',
      [userId, courseId, 'active']
    );

    if (enrollment.length === 0) {
      return res.status(403).json({
        status: 0,
        message: 'Not enrolled in this course'
      });
    }

    // Update or insert lesson progress
    await db.query(`
      INSERT INTO learning_lesson_progress (
        user_id, lesson_id, course_id, completed, watch_time, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        completed = VALUES(completed),
        watch_time = VALUES(watch_time),
        completed_at = VALUES(completed_at)
    `, [
      userId, lessonId, courseId, 
      completed ? 1 : 0, 
      watch_time || 0,
      completed ? new Date() : null
    ]);

    // Update overall course progress
    const [progressResult] = await db.query(`
      SELECT 
        COUNT(*) as total_lessons,
        SUM(CASE WHEN lp.completed = 1 THEN 1 ELSE 0 END) as completed_lessons
      FROM learning_lessons l
      LEFT JOIN learning_chapters ch ON l.chapter_id = ch.id
      LEFT JOIN learning_lesson_progress lp ON l.id = lp.lesson_id AND lp.user_id = ?
      WHERE ch.course_id = ?
    `, [userId, courseId]);

    const progress = progressResult[0];
    const progressPercent = progress.total_lessons > 0 
      ? Math.round((progress.completed_lessons / progress.total_lessons) * 100)
      : 0;

    // Update enrollment progress
    await db.query(
      'UPDATE learning_enrollments SET progress_pct = ?, last_accessed_at = NOW() WHERE user_id = ? AND course_id = ?',
      [progressPercent, userId, courseId]
    );

    let certificateReady = false;
    let certificateError = null;

    // Mark course as completed and issue certificate when progress reaches 100%.
    if (progressPercent === 100) {
      await db.query(
        `UPDATE learning_enrollments
         SET status = ?, completed_at = COALESCE(completed_at, NOW())
         WHERE user_id = ? AND course_id = ?`,
        ['completed', userId, courseId]
      );

      try {
        await generateCertificate(userId, courseId);
        certificateReady = true;
      } catch (certificateGenerationError) {
        console.error('Certificate generation failed:', certificateGenerationError);
        certificateError = 'Certificate generation failed';
      }
    }

    res.json({
      status: 1,
      message: 'Lesson progress updated successfully',
      data: {
        lesson_id: parseInt(lessonId),
        completed: completed ? 1 : 0,
        course_progress: progressPercent,
        certificate_ready: certificateReady,
        ...(certificateError ? { certificate_error: certificateError } : {})
      }
    });

  } catch (error) {
    console.error('Error in updateLessonProgress:', error);
    res.status(500).json({
      status: 0,
      message: 'Failed to update lesson progress'
    });
  }
};

// GET /api/learning/enrollments/courses/:id/progress - Get course progress
export const getCourseProgress = async (req, res) => {
  try {
    const userId = req.user.profile_id || req.user.id;
    const { id: courseId } = req.params;

    // Check if user is enrolled
    const [enrollment] = await db.query(
      'SELECT id, status, progress_pct, enrolled_at, completed_at FROM learning_enrollments WHERE user_id = ? AND course_id = ?',
      [userId, courseId]
    );

    if (enrollment.length === 0) {
      return res.status(404).json({
        status: 0,
        message: 'Not enrolled in this course'
      });
    }

    const enrollmentData = enrollment[0];

    // Get detailed progress
    const [progressResult] = await db.query(`
      SELECT 
        ch.id as chapter_id,
        ch.title as chapter_title,
        ch.sort_order as chapter_sort,
        l.id as lesson_id,
        l.title as lesson_title,
        l.type as lesson_type,
        l.sort_order as lesson_sort,
        COALESCE(lp.completed, 0) as lesson_completed,
        COALESCE(lp.watch_time, 0) as watch_time,
        lp.completed_at
      FROM learning_chapters ch
      LEFT JOIN learning_lessons l ON ch.course_id = ? AND l.chapter_id = ch.id
      LEFT JOIN learning_lesson_progress lp ON l.id = lp.lesson_id AND lp.user_id = ?
      WHERE ch.course_id = ?
      ORDER BY ch.sort_order, l.sort_order
    `, [courseId, userId, courseId]);

    // Group by chapters
    const chapters = {};
    progressResult.forEach(row => {
      if (!chapters[row.chapter_id]) {
        chapters[row.chapter_id] = {
          id: row.chapter_id,
          title: row.chapter_title,
          sort_order: row.chapter_sort,
          lessons: []
        };
      }
      
      if (row.lesson_id) {
        chapters[row.chapter_id].lessons.push({
          id: row.lesson_id,
          title: row.lesson_title,
          type: row.lesson_type,
          sort_order: row.lesson_sort,
          completed: row.lesson_completed,
          watch_time: row.watch_time,
          completed_at: row.completed_at
        });
      }
    });

    const [certificateRows] = await db.query(
      'SELECT id, certificate_number, issued_at, pdf_url FROM learning_certificates WHERE user_id = ? AND course_id = ? LIMIT 1',
      [userId, courseId]
    );
    const certificate = certificateRows[0] || null;

    res.json({
      status: 1,
      message: 'Course progress retrieved successfully',
      data: {
        enrollment: enrollmentData,
        chapters: Object.values(chapters),
        certificate_ready: Boolean(certificate),
        certificate
      }
    });

  } catch (error) {
    console.error('Error in getCourseProgress:', error);
    res.status(500).json({
      status: 0,
      message: 'Failed to retrieve course progress'
    });
  }
};

// GET /api/learning/enrollments/courses/:id/status - Get lightweight enrollment status
export const getEnrollmentStatus = async (req, res) => {
  try {
    const userId = req.user.profile_id || req.user.id;
    const { id } = req.params;

    const [courses] = await db.query(
      'SELECT id FROM learning_courses WHERE (id = ? OR slug = ?) LIMIT 1',
      [id, id]
    );

    if (!courses.length) {
      return res.status(404).json({
        status: 0,
        message: 'Course not found'
      });
    }

    const courseId = courses[0].id;
    const [rows] = await db.query(
      `SELECT id, status, progress_pct
       FROM learning_enrollments
       WHERE user_id = ? AND course_id = ?
       ORDER BY id DESC
       LIMIT 1`,
      [userId, courseId]
    );

    if (!rows.length) {
      return res.json({
        status: 1,
        message: 'Enrollment status retrieved successfully',
        data: {
          enrolled: false,
          enrollment_id: null,
          status: null,
          progress_pct: 0
        }
      });
    }

    const enrollment = rows[0];
    return res.json({
      status: 1,
      message: 'Enrollment status retrieved successfully',
      data: {
        enrolled: true,
        enrollment_id: enrollment.id,
        status: enrollment.status,
        progress_pct: Number(enrollment.progress_pct || 0)
      }
    });
  } catch (error) {
    console.error('Error in getEnrollmentStatus:', error);
    return res.status(500).json({
      status: 0,
      message: 'Failed to retrieve enrollment status'
    });
  }
};
