import db from '../config/db.js';
import slugify from 'slugify';

// Helper function to generate unique slug
const generateUniqueSlug = async (name, categoryId = null) => {
  let baseSlug = slugify(name, {
    lower: true,
    strict: true,
    remove: /[*+~.()'"!:@]/g
  });
  
  let slug = baseSlug;
  let counter = 1;
  
  while (true) {
    let query = 'SELECT id FROM learning_categories WHERE slug = ?';
    let params = [slug];
    
    if (categoryId) {
      query += ' AND id != ?';
      params.push(categoryId);
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

// GET /api/learning/categories - List categories (public)
export const getCategories = async (req, res) => {
  try {
    const [categories] = await db.query(`
      SELECT 
        id, name, slug, description, icon, sort_order, status, created_at
      FROM learning_categories
      WHERE status = 1
      ORDER BY sort_order ASC, name ASC
    `);

    // Get course counts for each category
    for (let category of categories) {
      const [countResult] = await db.query(
        'SELECT COUNT(*) as course_count FROM learning_courses WHERE category_id = ? AND status = ?',
        [category.id, 'published']
      );
      category.course_count = countResult[0].course_count;
    }

    res.json({
      status: 1,
      message: 'Categories retrieved successfully',
      data: categories
    });

  } catch (error) {
    console.error('Error in getCategories:', error);
    res.status(500).json({
      status: 0,
      message: 'Failed to retrieve categories'
    });
  }
};

// GET /api/learning/categories/:id - Get category by ID (public)
export const getCategoryById = async (req, res) => {
  try {
    const { id } = req.params;

    const [categories] = await db.query(`
      SELECT 
        id, name, slug, description, icon, sort_order, status, created_at
      FROM learning_categories
      WHERE id = ? AND status = 1
    `, [id]);

    if (categories.length === 0) {
      return res.status(404).json({
        status: 0,
        message: 'Category not found'
      });
    }

    const category = categories[0];

    // Get course count
    const [countResult] = await db.query(
      'SELECT COUNT(*) as course_count FROM learning_courses WHERE category_id = ? AND status = ?',
      [category.id, 'published']
    );
    category.course_count = countResult[0].course_count;

    res.json({
      status: 1,
      message: 'Category retrieved successfully',
      data: category
    });

  } catch (error) {
    console.error('Error in getCategoryById:', error);
    res.status(500).json({
      status: 0,
      message: 'Failed to retrieve category'
    });
  }
};

// POST /api/learning/categories - Create category (admin only)
export const createCategory = async (req, res) => {
  try {
    const { name, description, icon, sort_order = 0 } = req.body;

    if (!name) {
      return res.status(400).json({
        status: 0,
        message: 'Category name is required'
      });
    }

    // Generate unique slug
    const slug = await generateUniqueSlug(name);

    const [result] = await db.query(`
      INSERT INTO learning_categories (
        name, slug, description, icon, sort_order, status, created_at
      ) VALUES (?, ?, ?, ?, ?, 1, NOW())
    `, [name, slug, description, icon, sort_order]);

    res.status(201).json({
      status: 1,
      message: 'Category created successfully',
      data: {
        id: result.insertId,
        slug
      }
    });

  } catch (error) {
    console.error('Error in createCategory:', error);
    res.status(500).json({
      status: 0,
      message: 'Failed to create category'
    });
  }
};

// PUT /api/learning/categories/:id - Update category (admin only)
export const updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, icon, sort_order, status } = req.body;

    // Check if category exists
    const [categories] = await db.query(
      'SELECT id, slug FROM learning_categories WHERE id = ?',
      [id]
    );

    if (categories.length === 0) {
      return res.status(404).json({
        status: 0,
        message: 'Category not found'
      });
    }

    // Update slug if name changed
    let slug = categories[0].slug;
    if (name && name !== slug) {
      slug = await generateUniqueSlug(name, id);
    }

    // Build update query dynamically
    const updateFields = [];
    const updateValues = [];

    if (name !== undefined) {
      updateFields.push('name = ?');
      updateValues.push(name);
    }
    if (slug !== categories[0].slug) {
      updateFields.push('slug = ?');
      updateValues.push(slug);
    }
    if (description !== undefined) {
      updateFields.push('description = ?');
      updateValues.push(description);
    }
    if (icon !== undefined) {
      updateFields.push('icon = ?');
      updateValues.push(icon);
    }
    if (sort_order !== undefined) {
      updateFields.push('sort_order = ?');
      updateValues.push(sort_order);
    }
    if (status !== undefined) {
      updateFields.push('status = ?');
      updateValues.push(status);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        status: 0,
        message: 'No fields to update'
      });
    }

    updateValues.push(id);

    await db.query(
      `UPDATE learning_categories SET ${updateFields.join(', ')} WHERE id = ?`,
      updateValues
    );

    res.json({
      status: 1,
      message: 'Category updated successfully',
      data: { id, slug }
    });

  } catch (error) {
    console.error('Error in updateCategory:', error);
    res.status(500).json({
      status: 0,
      message: 'Failed to update category'
    });
  }
};

// DELETE /api/learning/categories/:id - Delete category (admin only)
export const deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if category exists
    const [categories] = await db.query(
      'SELECT id FROM learning_categories WHERE id = ?',
      [id]
    );

    if (categories.length === 0) {
      return res.status(404).json({
        status: 0,
        message: 'Category not found'
      });
    }

    // Check if category has courses
    const [courseCount] = await db.query(
      'SELECT COUNT(*) as count FROM learning_courses WHERE category_id = ?',
      [id]
    );

    if (courseCount[0].count > 0) {
      return res.status(400).json({
        status: 0,
        message: 'Cannot delete category with existing courses'
      });
    }

    // Delete category
    await db.query('DELETE FROM learning_categories WHERE id = ?', [id]);

    res.json({
      status: 1,
      message: 'Category deleted successfully'
    });

  } catch (error) {
    console.error('Error in deleteCategory:', error);
    res.status(500).json({
      status: 0,
      message: 'Failed to delete category'
    });
  }
};
