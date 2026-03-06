import express from 'express';
import {
  getCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory
} from '../controllers/categoryController.js';
import { verifyToken, requireAdmin } from '../middleware/authMiddleware.js';

const router = express.Router();

// Public routes (no auth required)
router.get('/', getCategories);
router.get('/:id', getCategoryById);

// Admin routes (admin auth required)
router.use(verifyToken);
router.post('/', requireAdmin, createCategory);
router.put('/:id', requireAdmin, updateCategory);
router.delete('/:id', requireAdmin, deleteCategory);

export default router;
