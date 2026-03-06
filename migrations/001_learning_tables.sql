-- Learning Module Database Schema
-- Run this in satellitestreetsmain database

-- Course categories (space-specific taxonomy)
CREATE TABLE IF NOT EXISTS learning_categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE,
  description TEXT,
  icon VARCHAR(100),
  sort_order INT DEFAULT 0,
  status TINYINT DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_slug (slug),
  INDEX idx_status (status)
);

-- Courses
CREATE TABLE IF NOT EXISTS learning_courses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(500) NOT NULL,
  slug VARCHAR(500) UNIQUE,
  description TEXT,
  short_description VARCHAR(1000),
  thumbnail VARCHAR(500),          -- Cloudinary/S3 URL
  preview_video VARCHAR(500),      -- S3 video URL
  organization_name VARCHAR(255),
  organization_email VARCHAR(255),
  organization_phone VARCHAR(30),
  organization_website VARCHAR(500),
  instructor_user_id INT NOT NULL, -- FK to users.id
  company_id INT,                  -- FK to company.id (org that owns it)
  category_id INT,                 -- FK to learning_categories.id
  custom_category VARCHAR(255),
  level ENUM('beginner','intermediate','advanced') DEFAULT 'beginner',
  language VARCHAR(50) DEFAULT 'English',
  delivery_mode ENUM('online','offline','hybrid') DEFAULT 'online',
  price DECIMAL(10,2) DEFAULT 0,
  currency VARCHAR(3) DEFAULT 'INR',
  is_free TINYINT DEFAULT 0,
  duration_hours DECIMAL(5,1),
  total_chapters INT DEFAULT 0,
  total_lessons INT DEFAULT 0,
  tags JSON,                       -- ["satellite","remote-sensing"]
  prerequisites TEXT,
  learning_outcomes TEXT,
  status ENUM('draft','published','archived') DEFAULT 'draft',
  featured TINYINT DEFAULT 0,
  enrollment_count INT DEFAULT 0,
  avg_rating DECIMAL(3,2) DEFAULT 0,
  published_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_company (company_id),
  INDEX idx_category (category_id),
  INDEX idx_status (status),
  INDEX idx_instructor (instructor_user_id),
  INDEX idx_slug (slug),
  INDEX idx_featured (featured)
);

-- Chapters (sections within a course)
CREATE TABLE IF NOT EXISTS learning_chapters (
  id INT AUTO_INCREMENT PRIMARY KEY,
  course_id INT NOT NULL,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  sort_order INT DEFAULT 0,
  is_free_preview TINYINT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (course_id) REFERENCES learning_courses(id) ON DELETE CASCADE,
  INDEX idx_course (course_id),
  INDEX idx_sort (sort_order)
);

-- Lessons (individual content items)
CREATE TABLE IF NOT EXISTS learning_lessons (
  id INT AUTO_INCREMENT PRIMARY KEY,
  chapter_id INT NOT NULL,
  course_id INT NOT NULL,
  title VARCHAR(500) NOT NULL,
  type ENUM('video','text','quiz','assignment','pdf','document') DEFAULT 'video',
  content TEXT,                    -- Rich text for text lessons
  video_url VARCHAR(500),          -- S3/Cloudinary video
  video_duration INT DEFAULT 0,    -- seconds
  attachment_url VARCHAR(500),     -- PDF/file attachment
  reference_image_url VARCHAR(500),
  sort_order INT DEFAULT 0,
  is_free_preview TINYINT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (chapter_id) REFERENCES learning_chapters(id) ON DELETE CASCADE,
  FOREIGN KEY (course_id) REFERENCES learning_courses(id) ON DELETE CASCADE,
  INDEX idx_chapter (chapter_id),
  INDEX idx_course (course_id),
  INDEX idx_sort (sort_order)
);

-- Enrollments
CREATE TABLE IF NOT EXISTS learning_enrollments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,            -- FK to users.id
  course_id INT NOT NULL,
  status ENUM('active','completed','dropped') DEFAULT 'active',
  progress_pct DECIMAL(5,2) DEFAULT 0,
  enrolled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP NULL,
  last_accessed_at TIMESTAMP NULL,
  UNIQUE KEY unique_enrollment (user_id, course_id),
  FOREIGN KEY (course_id) REFERENCES learning_courses(id),
  INDEX idx_user (user_id),
  INDEX idx_course (course_id),
  INDEX idx_status (status)
);

-- Lesson progress tracking
CREATE TABLE IF NOT EXISTS learning_lesson_progress (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  lesson_id INT NOT NULL,
  course_id INT NOT NULL,
  completed TINYINT DEFAULT 0,
  watch_time INT DEFAULT 0,        -- seconds watched
  completed_at TIMESTAMP NULL,
  UNIQUE KEY unique_progress (user_id, lesson_id),
  FOREIGN KEY (lesson_id) REFERENCES learning_lessons(id) ON DELETE CASCADE,
  INDEX idx_user (user_id),
  INDEX idx_lesson (lesson_id),
  INDEX idx_completed (completed)
);

-- Course reviews
CREATE TABLE IF NOT EXISTS learning_reviews (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  course_id INT NOT NULL,
  rating TINYINT NOT NULL,         -- 1-5
  review TEXT,
  status ENUM('pending','approved','rejected') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_review (user_id, course_id),
  FOREIGN KEY (course_id) REFERENCES learning_courses(id),
  INDEX idx_course (course_id),
  INDEX idx_status (status),
  INDEX idx_rating (rating)
);

-- Lead capture (interest registrations from non-enrolled users)
CREATE TABLE IF NOT EXISTS learning_leads (
  id INT AUTO_INCREMENT PRIMARY KEY,
  course_id INT NOT NULL,
  instructor_user_id INT,
  name VARCHAR(255),
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  company_name VARCHAR(255),
  message TEXT,
  source VARCHAR(100),             -- 'landing_page', 'course_detail', etc.
  lead_status ENUM('requested','contacted','qualified','enrolled','closed') DEFAULT 'requested',
  follow_up_at DATETIME NULL,
  last_contacted_at DATETIME NULL,
  status_note TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (course_id) REFERENCES learning_courses(id),
  INDEX idx_course (course_id),
  INDEX idx_instructor (instructor_user_id),
  INDEX idx_email (email),
  INDEX idx_created (created_at),
  INDEX idx_instructor_status_created (instructor_user_id, lead_status, created_at)
);

-- Certificates
CREATE TABLE IF NOT EXISTS learning_certificates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  course_id INT NOT NULL,
  certificate_number VARCHAR(50) UNIQUE,
  issued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  pdf_url VARCHAR(500),
  UNIQUE KEY unique_cert (user_id, course_id),
  FOREIGN KEY (course_id) REFERENCES learning_courses(id),
  INDEX idx_user (user_id),
  INDEX idx_course (course_id),
  INDEX idx_cert_number (certificate_number)
);
