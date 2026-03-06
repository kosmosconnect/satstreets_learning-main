import express from 'express';
import {
  getAllCourses,
  approveCourse,
  featureCourse,
  getAllEnrollments,
  getAllLeads,
  getLearningAnalytics
} from '../controllers/adminController.js';
import { verifyToken, requireAdmin } from '../middleware/authMiddleware.js';

const router = express.Router();

// All routes require admin authentication
router.use(verifyToken);
router.use(requireAdmin);

// GET /api/admin/learning/courses - Get all courses
router.get('/courses', getAllCourses);

// PUT /api/admin/learning/courses/:id/approve - Approve course
router.put('/courses/:id/approve', approveCourse);

// PUT /api/admin/learning/courses/:id/feature - Feature/unfeature course
router.put('/courses/:id/feature', featureCourse);

// GET /api/admin/learning/enrollments - Get all enrollments
router.get('/enrollments', getAllEnrollments);

// GET /api/admin/learning/leads - Get all leads
router.get('/leads', getAllLeads);

// GET /api/admin/learning/analytics - Get platform analytics
router.get('/analytics', getLearningAnalytics);

export default router;
