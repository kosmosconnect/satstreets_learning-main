import express from 'express';
import {
  getCertificate
} from '../controllers/certificateController.js';
import { verifyToken } from '../middleware/authMiddleware.js';

const router = express.Router();

// All routes require authentication
router.use(verifyToken);

// GET /api/learning/certificates/:id - Download certificate
router.get('/:id', getCertificate);

export default router;
