import db from '../config/db.js';

const CANONICAL_LEAD_SOURCES = new Set([
  'paid_course_gate',
  'paid_enroll_gate',
  'course_detail',
  'campaign',
  'homepage'
]);
const LEAD_SOURCE_ALIASES = {
  paid_course_gate: 'paid_course_gate',
  paid_enroll_gate: 'paid_enroll_gate',
  course_detail: 'course_detail',
  campaign: 'campaign',
  homepage: 'homepage',
  landing_page: 'homepage',
};
const VALID_LEAD_STATUSES = new Set(['requested', 'contacted', 'qualified', 'enrolled', 'closed']);

const normalizeLeadSource = (value) => {
  if (value == null) return '';
  const normalized = String(value).trim().toLowerCase();
  if (CANONICAL_LEAD_SOURCES.has(normalized)) return normalized;
  return LEAD_SOURCE_ALIASES[normalized] || '';
};

// GET /api/admin/learning/courses - Get all courses for admin
export const getAllCourses = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, search, featured } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    let whereConditions = [];
    let params = [];

    if (status) {
      whereConditions.push('c.status = ?');
      params.push(status);
    }

    if (search) {
      whereConditions.push('(c.title LIKE ? OR c.description LIKE ?)');
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm);
    }

    if (featured === 'true') {
      whereConditions.push('c.featured = 1');
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // Get total count
    const [countResult] = await db.query(
      `SELECT COUNT(*) as total FROM learning_courses c ${whereClause}`,
      params
    );
    const total = countResult[0].total;

    // Get courses
    const [courses] = await db.query(`
      SELECT 
        c.id, c.title, c.slug, c.short_description, c.level,
        c.price, c.is_free, c.status, c.featured,
        c.enrollment_count, c.avg_rating, c.published_at,
        c.created_at, c.updated_at,
        cat.name as category_name,
        u.display_name as instructor_name,
        comp.name as company_name
      FROM learning_courses c
      LEFT JOIN learning_categories cat ON c.category_id = cat.id
      LEFT JOIN users u ON c.instructor_user_id = u.id
      LEFT JOIN company comp ON c.company_id = comp.id
      ${whereClause}
      ORDER BY c.created_at DESC
      LIMIT ? OFFSET ?
    `, [...params, parseInt(limit), offset]);

    res.json({
      status: 1,
      message: 'Admin courses retrieved successfully',
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
    console.error('Error in getAllCourses:', error);
    res.status(500).json({
      status: 0,
      message: 'Failed to retrieve courses'
    });
  }
};

// PUT /api/admin/learning/courses/:id/approve - Approve course
export const approveCourse = async (req, res) => {
  try {
    const { id } = req.params;

    const [courses] = await db.query(
      'SELECT id, status FROM learning_courses WHERE id = ?',
      [id]
    );

    if (courses.length === 0) {
      return res.status(404).json({
        status: 0,
        message: 'Course not found'
      });
    }

    await db.query(
      'UPDATE learning_courses SET status = ?, published_at = NOW(), updated_at = NOW() WHERE id = ?',
      ['published', id]
    );

    res.json({
      status: 1,
      message: 'Course approved successfully'
    });

  } catch (error) {
    console.error('Error in approveCourse:', error);
    res.status(500).json({
      status: 0,
      message: 'Failed to approve course'
    });
  }
};

// PUT /api/admin/learning/courses/:id/feature - Feature/unfeature course
export const featureCourse = async (req, res) => {
  try {
    const { id } = req.params;
    const { featured } = req.body;

    if (featured === undefined) {
      return res.status(400).json({
        status: 0,
        message: 'Featured status is required'
      });
    }

    const [courses] = await db.query(
      'SELECT id FROM learning_courses WHERE id = ?',
      [id]
    );

    if (courses.length === 0) {
      return res.status(404).json({
        status: 0,
        message: 'Course not found'
      });
    }

    await db.query(
      'UPDATE learning_courses SET featured = ?, updated_at = NOW() WHERE id = ?',
      [featured ? 1 : 0, id]
    );

    res.json({
      status: 1,
      message: `Course ${featured ? 'featured' : 'unfeatured'} successfully`
    });

  } catch (error) {
    console.error('Error in featureCourse:', error);
    res.status(500).json({
      status: 0,
      message: 'Failed to update course feature status'
    });
  }
};

// GET /api/admin/learning/enrollments - Get all enrollments
export const getAllEnrollments = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, course_id } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    let whereConditions = [];
    let params = [];

    if (status) {
      whereConditions.push('e.status = ?');
      params.push(status);
    }

    if (course_id) {
      whereConditions.push('e.course_id = ?');
      params.push(course_id);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // Get total count
    const [countResult] = await db.query(
      `SELECT COUNT(*) as total FROM learning_enrollments e ${whereClause}`,
      params
    );
    const total = countResult[0].total;

    // Get enrollments
    const [enrollments] = await db.query(`
      SELECT 
        e.id, e.status, e.progress_pct, e.enrolled_at, e.completed_at,
        c.title as course_title, c.slug as course_slug,
        u.display_name as student_name, u.email as student_email,
        instr.display_name as instructor_name
      FROM learning_enrollments e
      JOIN learning_courses c ON e.course_id = c.id
      JOIN users u ON e.user_id = u.id
      LEFT JOIN users instr ON c.instructor_user_id = instr.id
      ${whereClause}
      ORDER BY e.enrolled_at DESC
      LIMIT ? OFFSET ?
    `, [...params, parseInt(limit), offset]);

    res.json({
      status: 1,
      message: 'Admin enrollments retrieved successfully',
      data: {
        enrollments,
        pagination: {
          current_page: parseInt(page),
          per_page: parseInt(limit),
          total,
          total_pages: Math.ceil(total / parseInt(limit))
        }
      }
    });

  } catch (error) {
    console.error('Error in getAllEnrollments:', error);
    res.status(500).json({
      status: 0,
      message: 'Failed to retrieve enrollments'
    });
  }
};

// GET /api/admin/learning/leads - Get all leads
export const getAllLeads = async (req, res) => {
  try {
    const { page = 1, limit = 20, course_id, source, status } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    let whereConditions = [];
    let params = [];

    if (course_id) {
      whereConditions.push('l.course_id = ?');
      params.push(course_id);
    }

    const normalizedSource = normalizeLeadSource(source);
    if (normalizedSource) {
      whereConditions.push('l.source = ?');
      params.push(normalizedSource);
    }

    const normalizedStatus = status ? String(status).trim().toLowerCase() : '';
    if (normalizedStatus && VALID_LEAD_STATUSES.has(normalizedStatus)) {
      whereConditions.push('l.lead_status = ?');
      params.push(normalizedStatus);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // Get total count
    const [countResult] = await db.query(
      `SELECT COUNT(*) as total FROM learning_leads l ${whereClause}`,
      params
    );
    const total = countResult[0].total;

    // Get leads
    const [leads] = await db.query(`
      SELECT 
        l.id, l.course_id, l.instructor_user_id, l.name, l.email, l.phone, l.company_name,
        l.message, l.source, l.lead_status, l.follow_up_at, l.last_contacted_at,
        l.status_note, l.created_at, l.updated_at,
        c.title as course_title, c.slug as course_slug
      FROM learning_leads l
      JOIN learning_courses c ON l.course_id = c.id
      ${whereClause}
      ORDER BY l.created_at DESC
      LIMIT ? OFFSET ?
    `, [...params, parseInt(limit), offset]);

    res.json({
      status: 1,
      message: 'Admin leads retrieved successfully',
      data: {
        leads,
        pagination: {
          current_page: parseInt(page),
          per_page: parseInt(limit),
          total,
          total_pages: Math.ceil(total / parseInt(limit))
        }
      }
    });

  } catch (error) {
    console.error('Error in getAllLeads:', error);
    res.status(500).json({
      status: 0,
      message: 'Failed to retrieve leads'
    });
  }
};

// GET /api/admin/learning/analytics - Get platform analytics
export const getLearningAnalytics = async (req, res) => {
  try {
    const [courseStats] = await db.query(`
      SELECT
        COUNT(*) as total_courses,
        SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) as published_courses,
        SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) as draft_courses,
        SUM(CASE WHEN status = 'archived' THEN 1 ELSE 0 END) as archived_courses,
        SUM(enrollment_count) as total_enrollments
      FROM learning_courses
    `);

    const [enrollmentStats] = await db.query(`
      SELECT
        status,
        COUNT(*) as count
      FROM learning_enrollments
      GROUP BY status
    `);

    const [recentActivity] = await db.query(`
      SELECT
        DATE(created_at) as date,
        COUNT(*) as courses_created
      FROM learning_courses
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `);

    res.json({
      status: 1,
      message: 'Learning analytics retrieved successfully',
      data: {
        course_stats: courseStats[0],
        enrollment_stats: enrollmentStats,
        recent_activity: recentActivity
      }
    });

  } catch (error) {
    console.error('Error in getLearningAnalytics:', error);
    res.status(500).json({
      status: 0,
      message: 'Failed to retrieve learning analytics'
    });
  }
};
