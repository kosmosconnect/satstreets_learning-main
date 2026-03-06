import db from '../config/db.js';
import { v4 as uuidv4 } from 'uuid';

// GET /api/learning/certificates/:id - Download certificate (Free tier)
export const getCertificate = async (req, res) => {
  try {
    const userId = req.user.profile_id || req.user.id;
    const { id: courseId } = req.params;

    // Check if user has completed the course
    const [certificate] = await db.query(`
      SELECT 
        cert.id, cert.certificate_number, cert.issued_at, cert.pdf_url,
        c.title as course_title, c.slug as course_slug,
        u.display_name as student_name,
        comp.name as company_name
      FROM learning_certificates cert
      JOIN learning_courses c ON cert.course_id = c.id
      JOIN users u ON cert.user_id = u.id
      LEFT JOIN company comp ON c.company_id = comp.id
      WHERE cert.user_id = ? AND cert.course_id = ?
    `, [userId, courseId]);

    if (certificate.length === 0) {
      return res.status(404).json({
        status: 0,
        message: 'Certificate not found or course not completed'
      });
    }

    res.json({
      status: 1,
      message: 'Certificate retrieved successfully',
      data: certificate[0]
    });

  } catch (error) {
    console.error('Error in getCertificate:', error);
    res.status(500).json({
      status: 0,
      message: 'Failed to retrieve certificate'
    });
  }
};

// POST /api/learning/certificates/generate/:course_id - Generate certificate (internal)
export const generateCertificate = async (userId, courseId) => {
  try {
    // Check if certificate already exists
    const [existing] = await db.query(
      'SELECT id FROM learning_certificates WHERE user_id = ? AND course_id = ?',
      [userId, courseId]
    );

    if (existing.length > 0) {
      return existing[0].id;
    }

    // Generate certificate number
    const certificateNumber = `CERT-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

    // Insert certificate
    const [result] = await db.query(`
      INSERT INTO learning_certificates (
        user_id, course_id, certificate_number, issued_at
      ) VALUES (?, ?, ?, NOW())
    `, [userId, courseId, certificateNumber]);

    // TODO: Generate PDF and update pdf_url
    // For now, certificate is created without PDF

    return result.insertId;

  } catch (error) {
    console.error('Error in generateCertificate:', error);
    throw error;
  }
};
