import express from 'express';
import {
  getInstructorCourses,
  getInstructorCourseById,
  getInstructorAnalytics,
  getInstructorLeads,
  updateInstructorLeadStatus,
  getCourseParticipants,
  issueCourseCertificate
} from '../controllers/instructorController.js';
import { verifyToken, requirePro } from '../middleware/authMiddleware.js';

const router = express.Router();

// All routes require authentication and Pro tier
router.use(verifyToken);
router.use(requirePro);

// GET /api/learning/instructor/courses - Get instructor's courses
router.get('/courses', getInstructorCourses);
router.get('/courses/:id', getInstructorCourseById);
router.get('/courses/:id/participants', getCourseParticipants);
router.post('/courses/:id/certificates/issue', issueCourseCertificate);

// GET /api/learning/instructor/analytics - Get instructor analytics
router.get('/analytics', getInstructorAnalytics);
router.get('/leads', getInstructorLeads);
router.put('/leads/:id/status', updateInstructorLeadStatus);

export default router;
