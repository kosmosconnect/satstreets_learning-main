import express from 'express';
import {
  enrollInCourse,
  getMyCourses,
  getMyRequests,
  getMySummary,
  updateLessonProgress,
  getCourseProgress,
  getEnrollmentStatus
} from '../controllers/enrollmentController.js';
import { verifyToken } from '../middleware/authMiddleware.js';

const router = express.Router();

// All routes require authentication
router.use(verifyToken);

// POST /api/learning/enrollments - Enroll in course
router.post('/', enrollInCourse);

// GET /api/learning/enrollments/my-courses - Get my enrolled courses
router.get('/my-courses', getMyCourses);

// GET /api/learning/enrollments/my-requests - Get requested paid courses
router.get('/my-requests', getMyRequests);

// GET /api/learning/enrollments/my-summary - Get learner summary
router.get('/my-summary', getMySummary);

// PUT /api/learning/enrollments/lessons/:id/progress - Mark lesson progress
router.put('/lessons/:id/progress', updateLessonProgress);

// GET /api/learning/enrollments/courses/:id/progress - Get course progress
router.get('/courses/:id/progress', getCourseProgress);

// GET /api/learning/enrollments/courses/:id/status - Get enrollment status
router.get('/courses/:id/status', getEnrollmentStatus);

export default router;
