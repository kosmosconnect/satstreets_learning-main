import db from '../config/db.js';
import slugify from 'slugify';
import { sendInstructorLeadEmail } from '../utils/leadEmailService.js';

const VALID_LESSON_TYPES = new Set(['video', 'text', 'quiz', 'assignment', 'pdf', 'document']);
const CANONICAL_LEAD_SOURCES = new Set([
  'paid_course_gate',
  'paid_enroll_gate',
  'course_detail',
  'campaign',
  'homepage'
]);
const VALID_LEAD_STATUSES = new Set(['requested', 'contacted', 'qualified', 'enrolled', 'closed']);
const LEAD_SOURCE_ALIASES = {
  paid_course_gate: 'paid_course_gate',
  paid_enroll_gate: 'paid_enroll_gate',
  course_detail: 'course_detail',
  campaign: 'campaign',
  homepage: 'homepage',
  landing_page: 'homepage',
};

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

const normalizeLeadSource = (value, fallback = 'course_detail') => {
  if (value == null) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (CANONICAL_LEAD_SOURCES.has(normalized)) return normalized;
  return LEAD_SOURCE_ALIASES[normalized] || fallback;
};

const normalizeLeadStatus = (value, fallback = 'requested') => {
  if (value == null) return fallback;
  const normalized = String(value).trim().toLowerCase();
  return VALID_LEAD_STATUSES.has(normalized) ? normalized : fallback;
};

// Helper function to generate unique slug
const generateUniqueSlug = async (title, courseId = null) => {
  let baseSlug = slugify(title, {
    lower: true,
    strict: true,
    remove: /[*+~.()'"!:@]/g
  });
  
  let slug = baseSlug;
  let counter = 1;
  
  while (true) {
    let query = 'SELECT id FROM learning_courses WHERE slug = ?';
    let params = [slug];
    
    if (courseId) {
      query += ' AND id != ?';
      params.push(courseId);
    }
    
    const [existing] = await db.query(query, params);
    
    if (existing.length === 0) {
      break;
    }
    
    slug = `${baseSlug}-${counter}`;
    counter++;
  }
  
  return slug;
};

const syncCourseContentCounts = async (courseId) => {
  const [chapterCountRows] = await db.query(
    'SELECT COUNT(*) as total_chapters FROM learning_chapters WHERE course_id = ?',
    [courseId]
  );
  const [lessonCountRows] = await db.query(
    'SELECT COUNT(*) as total_lessons FROM learning_lessons WHERE course_id = ?',
    [courseId]
  );

  const totalChapters = chapterCountRows[0]?.total_chapters || 0;
  const totalLessons = lessonCountRows[0]?.total_lessons || 0;

  await db.query(
    'UPDATE learning_courses SET total_chapters = ?, total_lessons = ?, updated_at = NOW() WHERE id = ?',
    [totalChapters, totalLessons, courseId]
  );
};

const getOwnedCourseById = async (courseId, userId) => {
  const [courses] = await db.query(
    'SELECT id, instructor_user_id FROM learning_courses WHERE id = ?',
    [courseId]
  );

  if (!courses.length) {
    return { course: null, error: { code: 404, message: 'Course not found' } };
  }

  if (courses[0].instructor_user_id !== userId) {
    return { course: null, error: { code: 403, message: 'Access denied' } };
  }

  return { course: courses[0], error: null };
};

// GET /api/learning/courses - List/search courses (public)
export const getCourses = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      category,
      level,
      search,
      sort = 'created_at',
      order = 'desc',
      featured,
      is_free,
      company_id
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    let whereConditions = ['c.status = ?', 'c.published_at IS NOT NULL'];
    let params = ['published'];

    // Build WHERE conditions
    if (category) {
      whereConditions.push('c.category_id = ?');
      params.push(category);
    }

    if (level) {
      whereConditions.push('c.level = ?');
      params.push(level);
    }

    if (search) {
      whereConditions.push('(c.title LIKE ? OR c.description LIKE ? OR c.short_description LIKE ?)');
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    if (featured === 'true') {
      whereConditions.push('c.featured = 1');
    }

    if (is_free === 'true' || is_free === 'false') {
      whereConditions.push('c.is_free = ?');
      params.push(is_free === 'true' ? 1 : 0);
    }

    if (company_id) {
      whereConditions.push('c.company_id = ?');
      params.push(company_id);
    }

    const whereClause = whereConditions.join(' AND ');

    // Validate and map sort field
    const sortFieldMap = {
      created_at: { field: 'created_at', order: 'DESC' },
      title: { field: 'title', order: 'ASC' },
      enrollment_count: { field: 'enrollment_count', order: 'DESC' },
      avg_rating: { field: 'avg_rating', order: 'DESC' },
      published_at: { field: 'published_at', order: 'DESC' },
      price_low: { field: 'price', order: 'ASC' },
      price_high: { field: 'price', order: 'DESC' }
    };
    const selectedSort = sortFieldMap[sort] || sortFieldMap.created_at;
    const sortField = selectedSort.field;
    const sortOrder =
      req.query.order == null
        ? selectedSort.order
        : (String(order).toLowerCase() === 'asc' ? 'ASC' : 'DESC');

    // Get total count
    const [countResult] = await db.query(
      `SELECT COUNT(*) as total FROM learning_courses c WHERE ${whereClause}`,
      params
    );
    const total = countResult[0].total;

    // Get courses
    const [courses] = await db.query(`
      SELECT 
        c.id, c.title, c.slug, c.short_description, c.thumbnail,
        c.level, c.language, c.price, c.currency, c.is_free,
        c.duration_hours, c.total_chapters, c.total_lessons,
        c.delivery_mode, c.custom_category,
        c.tags, c.status, c.featured, c.enrollment_count, c.company_id,
        c.avg_rating, c.published_at, c.created_at,
        cat.name as category_name,
        cat.slug as category_slug,
        u.display_name as instructor_name,
        u.thumb as instructor_avatar,
        comp.name as company_name,
        comp.thumb as company_logo
      FROM learning_courses c
      LEFT JOIN learning_categories cat ON c.category_id = cat.id
      LEFT JOIN users u ON c.instructor_user_id = u.id
      LEFT JOIN company comp ON c.company_id = comp.id
      WHERE ${whereClause}
      ORDER BY c.${sortField} ${sortOrder}
      LIMIT ? OFFSET ?
    `, [...params, parseInt(limit), offset]);

    console.log('Courses query result:', courses.length, 'courses found');
    console.log('Where clause:', whereClause);
    console.log('Params:', params);

    // Format response - add safety check for empty courses
    const formattedCourses = courses.map(course => ({
      ...course,
      tags: parseJsonSafe(course.tags, []),
      instructor: {
        name: course.instructor_name,
        avatar: course.instructor_avatar
      },
      company: course.company_id ? {
        id: course.company_id,
        name: course.company_name,
        logo: course.company_logo
      } : null
    }));

    res.json({
      status: 1,
      message: 'Courses retrieved successfully',
      data: {
        courses: formattedCourses,
        pagination: {
          current_page: parseInt(page),
          per_page: parseInt(limit),
          total: total,
          total_pages: Math.ceil(total / parseInt(limit))
        }
      }
    });

  } catch (error) {
    console.error('Error in getCourses:', error);
    res.status(500).json({
      status: 0,
      message: 'Failed to retrieve courses'
    });
  }
};

// GET /api/learning/courses/:id - Course detail (public)
export const getCourseById = async (req, res) => {
  try {
    const { id } = req.params;

    const [courses] = await db.query(`
      SELECT 
        c.id, c.title, c.slug, c.description, c.short_description,
        c.thumbnail, c.preview_video, c.level, c.language,
        c.delivery_mode,
        c.organization_name, c.organization_email, c.organization_phone, c.organization_website,
        c.price, c.currency, c.is_free, c.duration_hours,
        c.total_chapters, c.total_lessons, c.tags,
        c.prerequisites, c.learning_outcomes, c.custom_category, c.featured,
        c.enrollment_count, c.avg_rating, c.published_at,
        c.created_at, c.updated_at, c.company_id,
        cat.name as category_name,
        cat.slug as category_slug,
        u.display_name as instructor_name,
        u.thumb as instructor_avatar,
        u.bio as instructor_bio,
        comp.name as company_name,
        comp.thumb as company_logo,
        comp.bio as company_bio
      FROM learning_courses c
      LEFT JOIN learning_categories cat ON c.category_id = cat.id
      LEFT JOIN users u ON c.instructor_user_id = u.id
      LEFT JOIN company comp ON c.company_id = comp.id
      WHERE (c.id = ? OR c.slug = ?) AND c.status = 'published' AND c.published_at IS NOT NULL
    `, [id, id]);

    if (courses.length === 0) {
      return res.status(404).json({
        status: 0,
        message: 'Course not found'
      });
    }

    const course = courses[0];

    // Get chapters and lessons (titles only for public view)
    const [chapters] = await db.query(`
      SELECT 
        ch.id, ch.title, ch.description, ch.sort_order, ch.is_free_preview,
        (SELECT JSON_ARRAYAGG(
          JSON_OBJECT(
            'id', l.id,
            'title', l.title,
            'type', l.type,
            'duration', l.video_duration,
            'video_url', l.video_url,
            'attachment_url', l.attachment_url,
            'reference_image_url', l.reference_image_url,
            'sort_order', l.sort_order,
            'is_free_preview', l.is_free_preview
          )
        ) FROM learning_lessons l 
        WHERE l.chapter_id = ch.id 
        ORDER BY l.sort_order
      ) as lessons
      FROM learning_chapters ch
      WHERE ch.course_id = ?
      ORDER BY ch.sort_order
    `, [course.id]);

    const [reviewStatsRows] = await db.query(
      `SELECT COUNT(*) as review_count
       FROM learning_reviews
       WHERE course_id = ? AND status = 'approved'`,
      [course.id]
    );

    const [recentReviews] = await db.query(`
      SELECT
        r.id,
        r.rating,
        r.review,
        r.created_at,
        u.display_name as learner_name,
        u.thumb as learner_avatar
      FROM learning_reviews r
      LEFT JOIN users u ON r.user_id = u.id
      WHERE r.course_id = ? AND r.status = 'approved'
      ORDER BY r.created_at DESC
      LIMIT 5
    `, [course.id]);

    // Format response
    const formattedCourse = {
      ...course,
      tags: parseJsonSafe(course.tags, []),
      review_count: Number(reviewStatsRows[0]?.review_count || 0),
      recent_reviews: recentReviews.map((reviewRow) => ({
        id: reviewRow.id,
        rating: Number(reviewRow.rating || 0),
        review: reviewRow.review,
        created_at: reviewRow.created_at,
        learner_name: reviewRow.learner_name || 'Learner',
        learner_avatar: reviewRow.learner_avatar || null,
      })),
      instructor: {
        name: course.instructor_name,
        avatar: course.instructor_avatar,
        bio: course.instructor_bio
      },
      company: course.company_id ? {
        id: course.company_id,
        name: course.company_name,
        logo: course.company_logo,
        bio: course.company_bio
      } : null,
      chapters: chapters.map(chapter => ({
        ...chapter,
        lessons: parseJsonSafe(chapter.lessons, [])
      }))
    };

    res.json({
      status: 1,
      message: 'Course retrieved successfully',
      data: formattedCourse
    });

  } catch (error) {
    console.error('Error in getCourseById:', error);
    res.status(500).json({
      status: 0,
      message: 'Failed to retrieve course'
    });
  }
};

// POST /api/learning/courses - Create course (Pro tier)
export const createCourse = async (req, res) => {
  try {
    const userId = req.user.profile_id || req.user.id;
    const {
      title,
      description,
      short_description,
      category_id,
      custom_category,
      level = 'beginner',
      language = 'English',
      delivery_mode = 'online',
      price = 0,
      currency = 'INR',
      is_free = 0,
      duration_hours,
      thumbnail,
      preview_video,
      organization_name,
      organization_email,
      organization_phone,
      organization_website,
      tags,
      prerequisites,
      learning_outcomes
    } = req.body;

    if (!title || !description) {
      return res.status(400).json({
        status: 0,
        message: 'Title and description are required'
      });
    }

    // Generate unique slug
    const slug = await generateUniqueSlug(title);

    // Insert course
    const [result] = await db.query(`
      INSERT INTO learning_courses (
        title, slug, description, short_description,
        thumbnail, preview_video,
        organization_name, organization_email, organization_phone, organization_website,
        instructor_user_id, category_id, custom_category, level, language, delivery_mode,
        price, currency, is_free, duration_hours,
        tags, prerequisites, learning_outcomes,
        status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', NOW())
    `, [
      title, slug, description, short_description,
      thumbnail || null,
      preview_video || null,
      organization_name || null,
      organization_email || null,
      organization_phone || null,
      organization_website || null,
      userId, category_id || null, custom_category || null, level, language, delivery_mode,
      price, currency, is_free, duration_hours,
      tags ? JSON.stringify(tags) : null, prerequisites, learning_outcomes
    ]);

    res.status(201).json({
      status: 1,
      message: 'Course created successfully',
      data: {
        id: result.insertId,
        slug
      }
    });

  } catch (error) {
    console.error('Error in createCourse:', error);
    res.status(500).json({
      status: 0,
      message: 'Failed to create course'
    });
  }
};

// PUT /api/learning/courses/:id - Update course (Pro tier)
export const updateCourse = async (req, res) => {
  try {
    const userId = req.user.profile_id || req.user.id;
    const { id } = req.params;
    const {
      title,
      description,
      short_description,
      category_id,
      custom_category,
      level,
      language,
      delivery_mode,
      price,
      currency,
      is_free,
      duration_hours,
      tags,
      prerequisites,
      learning_outcomes,
      thumbnail,
      preview_video,
      organization_name,
      organization_email,
      organization_phone,
      organization_website
    } = req.body;

    // Check if course exists and user is the instructor
    const [courses] = await db.query(
      'SELECT id, instructor_user_id, slug FROM learning_courses WHERE id = ?',
      [id]
    );

    if (courses.length === 0) {
      return res.status(404).json({
        status: 0,
        message: 'Course not found'
      });
    }

    if (courses[0].instructor_user_id !== userId) {
      return res.status(403).json({
        status: 0,
        message: 'You can only edit your own courses'
      });
    }

    // Update slug if title changed
    let slug = courses[0].slug;
    if (title && title !== slug) {
      slug = await generateUniqueSlug(title, id);
    }

    // Build update query dynamically
    const updateFields = [];
    const updateValues = [];

    if (title !== undefined) {
      updateFields.push('title = ?');
      updateValues.push(title);
    }
    if (slug !== courses[0].slug) {
      updateFields.push('slug = ?');
      updateValues.push(slug);
    }
    if (description !== undefined) {
      updateFields.push('description = ?');
      updateValues.push(description);
    }
    if (short_description !== undefined) {
      updateFields.push('short_description = ?');
      updateValues.push(short_description);
    }
    if (category_id !== undefined) {
      updateFields.push('category_id = ?');
      updateValues.push(category_id);
    }
    if (custom_category !== undefined) {
      updateFields.push('custom_category = ?');
      updateValues.push(custom_category || null);
    }
    if (level !== undefined) {
      updateFields.push('level = ?');
      updateValues.push(level);
    }
    if (language !== undefined) {
      updateFields.push('language = ?');
      updateValues.push(language);
    }
    if (delivery_mode !== undefined) {
      updateFields.push('delivery_mode = ?');
      updateValues.push(delivery_mode);
    }
    if (price !== undefined) {
      updateFields.push('price = ?');
      updateValues.push(price);
    }
    if (currency !== undefined) {
      updateFields.push('currency = ?');
      updateValues.push(currency);
    }
    if (is_free !== undefined) {
      updateFields.push('is_free = ?');
      updateValues.push(is_free);
    }
    if (duration_hours !== undefined) {
      updateFields.push('duration_hours = ?');
      updateValues.push(duration_hours);
    }
    if (tags !== undefined) {
      updateFields.push('tags = ?');
      updateValues.push(tags ? JSON.stringify(tags) : null);
    }
    if (prerequisites !== undefined) {
      updateFields.push('prerequisites = ?');
      updateValues.push(prerequisites);
    }
    if (learning_outcomes !== undefined) {
      updateFields.push('learning_outcomes = ?');
      updateValues.push(learning_outcomes);
    }
    if (thumbnail !== undefined) {
      updateFields.push('thumbnail = ?');
      updateValues.push(thumbnail);
    }
    if (preview_video !== undefined) {
      updateFields.push('preview_video = ?');
      updateValues.push(preview_video);
    }
    if (organization_name !== undefined) {
      updateFields.push('organization_name = ?');
      updateValues.push(organization_name || null);
    }
    if (organization_email !== undefined) {
      updateFields.push('organization_email = ?');
      updateValues.push(organization_email || null);
    }
    if (organization_phone !== undefined) {
      updateFields.push('organization_phone = ?');
      updateValues.push(organization_phone || null);
    }
    if (organization_website !== undefined) {
      updateFields.push('organization_website = ?');
      updateValues.push(organization_website || null);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        status: 0,
        message: 'No fields to update'
      });
    }

    updateFields.push('updated_at = NOW()');
    updateValues.push(id);

    await db.query(
      `UPDATE learning_courses SET ${updateFields.join(', ')} WHERE id = ?`,
      updateValues
    );

    res.json({
      status: 1,
      message: 'Course updated successfully',
      data: { id, slug }
    });

  } catch (error) {
    console.error('Error in updateCourse:', error);
    res.status(500).json({
      status: 0,
      message: 'Failed to update course'
    });
  }
};

// DELETE /api/learning/courses/:id - Archive course (Pro tier)
export const deleteCourse = async (req, res) => {
  try {
    const userId = req.user.profile_id || req.user.id;
    const { id } = req.params;

    // Check if course exists and user is the instructor
    const [courses] = await db.query(
      'SELECT id, instructor_user_id FROM learning_courses WHERE id = ?',
      [id]
    );

    if (courses.length === 0) {
      return res.status(404).json({
        status: 0,
        message: 'Course not found'
      });
    }

    if (courses[0].instructor_user_id !== userId) {
      return res.status(403).json({
        status: 0,
        message: 'You can only archive your own courses'
      });
    }

    // Archive course (soft delete)
    await db.query(
      'UPDATE learning_courses SET status = ?, updated_at = NOW() WHERE id = ?',
      ['archived', id]
    );

    res.json({
      status: 1,
      message: 'Course archived successfully'
    });

  } catch (error) {
    console.error('Error in deleteCourse:', error);
    res.status(500).json({
      status: 0,
      message: 'Failed to archive course'
    });
  }
};

// POST /api/learning/courses/:id/publish - Publish own draft course (Pro tier)
export const publishCourse = async (req, res) => {
  try {
    const userId = req.user.profile_id || req.user.id;
    const { id } = req.params;

    const [courses] = await db.query(
      'SELECT id, instructor_user_id, status, total_chapters, total_lessons FROM learning_courses WHERE id = ?',
      [id]
    );

    if (courses.length === 0) {
      return res.status(404).json({
        status: 0,
        message: 'Course not found'
      });
    }

    const course = courses[0];
    if (course.instructor_user_id !== userId) {
      return res.status(403).json({
        status: 0,
        message: 'You can only publish your own courses'
      });
    }

    if (course.status === 'archived') {
      return res.status(400).json({
        status: 0,
        message: 'Archived courses cannot be published'
      });
    }

    if (Number(course.total_chapters || 0) < 1 || Number(course.total_lessons || 0) < 1) {
      return res.status(400).json({
        status: 0,
        message: 'Add at least one chapter and one lesson before publishing'
      });
    }

    if (course.status === 'published') {
      return res.json({
        status: 1,
        message: 'Course already published'
      });
    }

    await db.query(
      'UPDATE learning_courses SET status = ?, published_at = NOW(), updated_at = NOW() WHERE id = ?',
      ['published', id]
    );

    return res.json({
      status: 1,
      message: 'Course published successfully'
    });
  } catch (error) {
    console.error('Error in publishCourse:', error);
    return res.status(500).json({
      status: 0,
      message: 'Failed to publish course'
    });
  }
};

// POST /api/learning/courses/:id/lead - Capture lead (public)
export const captureLead = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, phone, company_name, message, source = 'course_detail' } = req.body;
    const safeSource = normalizeLeadSource(source, 'course_detail');
    const safeLeadStatus = normalizeLeadStatus('requested');
    const safeEmail = String(email || '').trim().toLowerCase();

    if (!safeEmail) {
      return res.status(400).json({
        status: 0,
        message: 'Email is required'
      });
    }

    // Check if course exists
    const [courses] = await db.query(
      `SELECT
        c.id, c.title, c.slug, c.instructor_user_id,
        instr.display_name AS instructor_name,
        instr.email AS instructor_email
       FROM learning_courses c
       LEFT JOIN users instr ON instr.id = c.instructor_user_id
       WHERE (c.id = ? OR c.slug = ?) AND c.status = ?`,
      [id, id, 'published']
    );

    if (courses.length === 0) {
      return res.status(404).json({
        status: 0,
        message: 'Course not found'
      });
    }

    const course = courses[0];

    // Insert lead
    const [result] = await db.query(`
      INSERT INTO learning_leads (
        course_id, instructor_user_id, name, email, phone, company_name, message,
        source, lead_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
    `, [course.id, course.instructor_user_id || null, name, safeEmail, phone, company_name, message, safeSource, safeLeadStatus]);

    void sendInstructorLeadEmail({
      instructorEmail: course.instructor_email,
      instructorName: course.instructor_name,
      courseTitle: course.title,
      courseSlug: course.slug,
      leadSource: safeSource,
      leadName: name,
      leadEmail: safeEmail,
      leadPhone: phone,
      leadCompany: company_name,
      leadMessage: message,
    });

    res.status(201).json({
      status: 1,
      message: 'Lead captured successfully',
      data: {
        id: result.insertId,
        course_id: course.id,
        course_slug: course.slug,
        course_title: course.title,
        source: safeSource,
        lead_status: safeLeadStatus
      }
    });

  } catch (error) {
    console.error('Error in captureLead:', error);
    res.status(500).json({
      status: 0,
      message: 'Failed to capture lead'
    });
  }
};

// POST /api/learning/courses/:id/review - Submit or update review (authenticated)
export const submitReview = async (req, res) => {
  try {
    const userId = req.user.profile_id || req.user.id;
    const { id: courseId } = req.params;
    const { rating, review } = req.body;

    const numericRating = Number(rating);
    if (!Number.isFinite(numericRating) || numericRating < 1 || numericRating > 5) {
      return res.status(400).json({
        status: 0,
        message: 'Rating must be between 1 and 5'
      });
    }

    const [courses] = await db.query(
      'SELECT id FROM learning_courses WHERE id = ? AND status = ?',
      [courseId, 'published']
    );
    if (courses.length === 0) {
      return res.status(404).json({
        status: 0,
        message: 'Course not found'
      });
    }

    // Restrict reviews to enrolled users to keep trust signals meaningful.
    const [enrollments] = await db.query(
      'SELECT id FROM learning_enrollments WHERE user_id = ? AND course_id = ?',
      [userId, courseId]
    );
    if (enrollments.length === 0) {
      return res.status(403).json({
        status: 0,
        message: 'Only enrolled learners can review this course'
      });
    }

    await db.query(
      `INSERT INTO learning_reviews (user_id, course_id, rating, review, status, created_at)
       VALUES (?, ?, ?, ?, 'approved', NOW())
       ON DUPLICATE KEY UPDATE rating = VALUES(rating), review = VALUES(review), status = 'approved'`,
      [userId, courseId, numericRating, review || null]
    );

    const [ratingRows] = await db.query(
      `SELECT ROUND(AVG(rating), 2) as avg_rating
       FROM learning_reviews
       WHERE course_id = ? AND status = 'approved'`,
      [courseId]
    );

    await db.query(
      'UPDATE learning_courses SET avg_rating = ?, updated_at = NOW() WHERE id = ?',
      [ratingRows[0]?.avg_rating || 0, courseId]
    );

    res.json({
      status: 1,
      message: 'Review submitted successfully'
    });
  } catch (error) {
    console.error('Error in submitReview:', error);
    res.status(500).json({
      status: 0,
      message: 'Failed to submit review'
    });
  }
};

// POST /api/learning/courses/:id/chapters - Create chapter (Pro tier)
export const createChapter = async (req, res) => {
  try {
    const userId = req.user.profile_id || req.user.id;
    const { id: courseId } = req.params;
    const { title, description, sort_order, is_free_preview = 0 } = req.body;

    if (!title || !String(title).trim()) {
      return res.status(400).json({
        status: 0,
        message: 'Chapter title is required'
      });
    }

    const { error } = await getOwnedCourseById(courseId, userId);
    if (error) {
      return res.status(error.code).json({ status: 0, message: error.message });
    }

    let nextSortOrder = sort_order;
    if (nextSortOrder === undefined || nextSortOrder === null) {
      const [sortRows] = await db.query(
        'SELECT COALESCE(MAX(sort_order), -1) + 1 as next_sort FROM learning_chapters WHERE course_id = ?',
        [courseId]
      );
      nextSortOrder = sortRows[0]?.next_sort || 0;
    }

    const [result] = await db.query(
      `INSERT INTO learning_chapters (course_id, title, description, sort_order, is_free_preview, created_at)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [courseId, title.trim(), description || null, Number(nextSortOrder), is_free_preview ? 1 : 0]
    );

    await syncCourseContentCounts(courseId);

    return res.status(201).json({
      status: 1,
      message: 'Chapter created successfully',
      data: {
        id: result.insertId
      }
    });
  } catch (error) {
    console.error('Error in createChapter:', error);
    return res.status(500).json({
      status: 0,
      message: 'Failed to create chapter'
    });
  }
};

// PUT /api/learning/chapters/:id - Update chapter (Pro tier)
export const updateChapter = async (req, res) => {
  try {
    const userId = req.user.profile_id || req.user.id;
    const { id: chapterId } = req.params;
    const { title, description, sort_order, is_free_preview } = req.body;

    const [chapterRows] = await db.query(
      `SELECT ch.id, ch.course_id, c.instructor_user_id
       FROM learning_chapters ch
       JOIN learning_courses c ON ch.course_id = c.id
       WHERE ch.id = ?`,
      [chapterId]
    );

    if (!chapterRows.length) {
      return res.status(404).json({
        status: 0,
        message: 'Chapter not found'
      });
    }

    if (chapterRows[0].instructor_user_id !== userId) {
      return res.status(403).json({
        status: 0,
        message: 'Access denied'
      });
    }

    const updateFields = [];
    const values = [];

    if (title !== undefined) {
      if (!String(title).trim()) {
        return res.status(400).json({
          status: 0,
          message: 'Chapter title cannot be empty'
        });
      }
      updateFields.push('title = ?');
      values.push(String(title).trim());
    }
    if (description !== undefined) {
      updateFields.push('description = ?');
      values.push(description || null);
    }
    if (sort_order !== undefined) {
      updateFields.push('sort_order = ?');
      values.push(Number(sort_order));
    }
    if (is_free_preview !== undefined) {
      updateFields.push('is_free_preview = ?');
      values.push(is_free_preview ? 1 : 0);
    }

    if (!updateFields.length) {
      return res.status(400).json({
        status: 0,
        message: 'No fields to update'
      });
    }

    values.push(chapterId);

    await db.query(
      `UPDATE learning_chapters SET ${updateFields.join(', ')} WHERE id = ?`,
      values
    );

    return res.json({
      status: 1,
      message: 'Chapter updated successfully'
    });
  } catch (error) {
    console.error('Error in updateChapter:', error);
    return res.status(500).json({
      status: 0,
      message: 'Failed to update chapter'
    });
  }
};

// DELETE /api/learning/chapters/:id - Delete chapter (Pro tier)
export const deleteChapter = async (req, res) => {
  try {
    const userId = req.user.profile_id || req.user.id;
    const { id: chapterId } = req.params;

    const [chapterRows] = await db.query(
      `SELECT ch.id, ch.course_id, c.instructor_user_id
       FROM learning_chapters ch
       JOIN learning_courses c ON ch.course_id = c.id
       WHERE ch.id = ?`,
      [chapterId]
    );

    if (!chapterRows.length) {
      return res.status(404).json({
        status: 0,
        message: 'Chapter not found'
      });
    }

    const chapter = chapterRows[0];
    if (chapter.instructor_user_id !== userId) {
      return res.status(403).json({
        status: 0,
        message: 'Access denied'
      });
    }

    await db.query('DELETE FROM learning_chapters WHERE id = ?', [chapterId]);
    await syncCourseContentCounts(chapter.course_id);

    return res.json({
      status: 1,
      message: 'Chapter deleted successfully'
    });
  } catch (error) {
    console.error('Error in deleteChapter:', error);
    return res.status(500).json({
      status: 0,
      message: 'Failed to delete chapter'
    });
  }
};

// POST /api/learning/chapters/:id/lessons - Create lesson (Pro tier)
export const createLesson = async (req, res) => {
  try {
    const userId = req.user.profile_id || req.user.id;
    const { id: chapterId } = req.params;
    const {
      title,
      type = 'text',
      content,
      video_url,
      video_duration,
      attachment_url,
      reference_image_url,
      sort_order,
      is_free_preview = 0
    } = req.body;

    if (!title || !String(title).trim()) {
      return res.status(400).json({
        status: 0,
        message: 'Lesson title is required'
      });
    }

    if (!VALID_LESSON_TYPES.has(type)) {
      return res.status(400).json({
        status: 0,
        message: 'Invalid lesson type'
      });
    }

    const [chapterRows] = await db.query(
      `SELECT ch.id, ch.course_id, c.instructor_user_id
       FROM learning_chapters ch
       JOIN learning_courses c ON ch.course_id = c.id
       WHERE ch.id = ?`,
      [chapterId]
    );

    if (!chapterRows.length) {
      return res.status(404).json({
        status: 0,
        message: 'Chapter not found'
      });
    }

    const chapter = chapterRows[0];
    if (chapter.instructor_user_id !== userId) {
      return res.status(403).json({
        status: 0,
        message: 'Access denied'
      });
    }

    let nextSortOrder = sort_order;
    if (nextSortOrder === undefined || nextSortOrder === null) {
      const [sortRows] = await db.query(
        'SELECT COALESCE(MAX(sort_order), -1) + 1 as next_sort FROM learning_lessons WHERE chapter_id = ?',
        [chapterId]
      );
      nextSortOrder = sortRows[0]?.next_sort || 0;
    }

    const [result] = await db.query(
      `INSERT INTO learning_lessons
       (chapter_id, course_id, title, type, content, video_url, video_duration, attachment_url, reference_image_url, sort_order, is_free_preview, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        chapterId,
        chapter.course_id,
        title.trim(),
        type,
        content || null,
        video_url || null,
        video_duration ? Number(video_duration) : 0,
        attachment_url || null,
        reference_image_url || null,
        Number(nextSortOrder),
        is_free_preview ? 1 : 0
      ]
    );

    await syncCourseContentCounts(chapter.course_id);

    return res.status(201).json({
      status: 1,
      message: 'Lesson created successfully',
      data: {
        id: result.insertId
      }
    });
  } catch (error) {
    console.error('Error in createLesson:', error);
    return res.status(500).json({
      status: 0,
      message: 'Failed to create lesson'
    });
  }
};

// PUT /api/learning/lessons/:id - Update lesson (Pro tier)
export const updateLesson = async (req, res) => {
  try {
    const userId = req.user.profile_id || req.user.id;
    const { id: lessonId } = req.params;
    const {
      title,
      type,
      content,
      video_url,
      video_duration,
      attachment_url,
      reference_image_url,
      sort_order,
      is_free_preview
    } = req.body;

    const [lessonRows] = await db.query(
      `SELECT l.id, l.course_id, c.instructor_user_id
       FROM learning_lessons l
       JOIN learning_courses c ON l.course_id = c.id
       WHERE l.id = ?`,
      [lessonId]
    );

    if (!lessonRows.length) {
      return res.status(404).json({
        status: 0,
        message: 'Lesson not found'
      });
    }

    const lesson = lessonRows[0];
    if (lesson.instructor_user_id !== userId) {
      return res.status(403).json({
        status: 0,
        message: 'Access denied'
      });
    }

    const updateFields = [];
    const values = [];

    if (title !== undefined) {
      if (!String(title).trim()) {
        return res.status(400).json({
          status: 0,
          message: 'Lesson title cannot be empty'
        });
      }
      updateFields.push('title = ?');
      values.push(String(title).trim());
    }
    if (type !== undefined) {
      if (!VALID_LESSON_TYPES.has(type)) {
        return res.status(400).json({
          status: 0,
          message: 'Invalid lesson type'
        });
      }
      updateFields.push('type = ?');
      values.push(type);
    }
    if (content !== undefined) {
      updateFields.push('content = ?');
      values.push(content || null);
    }
    if (video_url !== undefined) {
      updateFields.push('video_url = ?');
      values.push(video_url || null);
    }
    if (video_duration !== undefined) {
      updateFields.push('video_duration = ?');
      values.push(video_duration ? Number(video_duration) : 0);
    }
    if (attachment_url !== undefined) {
      updateFields.push('attachment_url = ?');
      values.push(attachment_url || null);
    }
    if (reference_image_url !== undefined) {
      updateFields.push('reference_image_url = ?');
      values.push(reference_image_url || null);
    }
    if (sort_order !== undefined) {
      updateFields.push('sort_order = ?');
      values.push(Number(sort_order));
    }
    if (is_free_preview !== undefined) {
      updateFields.push('is_free_preview = ?');
      values.push(is_free_preview ? 1 : 0);
    }

    if (!updateFields.length) {
      return res.status(400).json({
        status: 0,
        message: 'No fields to update'
      });
    }

    values.push(lessonId);

    await db.query(
      `UPDATE learning_lessons SET ${updateFields.join(', ')} WHERE id = ?`,
      values
    );

    return res.json({
      status: 1,
      message: 'Lesson updated successfully'
    });
  } catch (error) {
    console.error('Error in updateLesson:', error);
    return res.status(500).json({
      status: 0,
      message: 'Failed to update lesson'
    });
  }
};

// DELETE /api/learning/lessons/:id - Delete lesson (Pro tier)
export const deleteLesson = async (req, res) => {
  try {
    const userId = req.user.profile_id || req.user.id;
    const { id: lessonId } = req.params;

    const [lessonRows] = await db.query(
      `SELECT l.id, l.course_id, c.instructor_user_id
       FROM learning_lessons l
       JOIN learning_courses c ON l.course_id = c.id
       WHERE l.id = ?`,
      [lessonId]
    );

    if (!lessonRows.length) {
      return res.status(404).json({
        status: 0,
        message: 'Lesson not found'
      });
    }

    const lesson = lessonRows[0];
    if (lesson.instructor_user_id !== userId) {
      return res.status(403).json({
        status: 0,
        message: 'Access denied'
      });
    }

    await db.query('DELETE FROM learning_lessons WHERE id = ?', [lessonId]);
    await syncCourseContentCounts(lesson.course_id);

    return res.json({
      status: 1,
      message: 'Lesson deleted successfully'
    });
  } catch (error) {
    console.error('Error in deleteLesson:', error);
    return res.status(500).json({
      status: 0,
      message: 'Failed to delete lesson'
    });
  }
};
