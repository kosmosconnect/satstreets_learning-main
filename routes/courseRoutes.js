import express from 'express';
import {
  getCourses,
  getCourseById,
  createCourse,
  updateCourse,
  deleteCourse,
  publishCourse,
  captureLead,
  submitReview,
  createChapter,
  updateChapter,
  deleteChapter,
  createLesson,
  updateLesson,
  deleteLesson
} from '../controllers/courseController.js';
import { verifyToken, requirePro } from '../middleware/authMiddleware.js';

const router = express.Router();

// Public routes (no auth required)
router.get('/', getCourses);
router.get('/:id', getCourseById);
router.post('/:id/lead', captureLead);

// Protected routes (auth required)
router.use(verifyToken);

// Authenticated learner routes
router.post('/:id/review', submitReview);

// Pro tier routes (instructor features)
router.post('/', requirePro, createCourse);
router.put('/:id', requirePro, updateCourse);
router.delete('/:id', requirePro, deleteCourse);
router.post('/:id/publish', requirePro, publishCourse);
router.post('/:id/chapters', requirePro, createChapter);
router.put('/chapters/:id', requirePro, updateChapter);
router.delete('/chapters/:id', requirePro, deleteChapter);
router.post('/chapters/:id/lessons', requirePro, createLesson);
router.put('/lessons/:id', requirePro, updateLesson);
router.delete('/lessons/:id', requirePro, deleteLesson);

export default router;
