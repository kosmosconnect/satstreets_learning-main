import express from "express";
import db from "./config/db.js";
import courseRoutes from "./routes/courseRoutes.js";
import enrollmentRoutes from "./routes/enrollmentRoutes.js";
import instructorRoutes from "./routes/instructorRoutes.js";
import categoryRoutes from "./routes/categoryRoutes.js";
import certificateRoutes from "./routes/certificateRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

const app = express();

// Trust proxy - required when running behind Cloudflare/nginx reverse proxy
app.set('trust proxy', 1);

// Security headers - configure CSP to allow images from API, Cloudinary, and S3
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: [
        "'self'",
        "data:",
        "blob:",
        "http://localhost:5000",
        "http://localhost:5001",
        "https://res.cloudinary.com",
        "https://satstreetdevtest.s3.amazonaws.com",
        "https://satstreetdevtest.s3.ap-south-1.amazonaws.com"
      ],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      connectSrc: ["'self'", "http://localhost:5000", "http://localhost:5001"],
      fontSrc: ["'self'", "data:"],
    },
  },
}));

// CORS configuration
const corsOptions = {
  origin: [
    'http://localhost:3500', // SatStreet_web-main
    'http://localhost:3000', // satstreet_admin-mainnew
    'http://localhost:5000', // satstreet_api-main
    'http://localhost:5001', // This service
    'http://localhost:5002', // satstreets_jobs-main
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: { status: 0, message: 'Too many requests from this IP, please try again later.' }
});
app.use('/api/', limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 1, 
    message: 'Satellite Streets Learning API is running',
    timestamp: new Date().toISOString(),
    port: process.env.PORT || 5001
  });
});

// API routes
app.use('/api/learning/courses', courseRoutes);
app.use('/api/learning/enrollments', enrollmentRoutes);
app.use('/api/learning/instructor', instructorRoutes);
app.use('/api/learning/categories', categoryRoutes);
app.use('/api/learning/certificates', certificateRoutes);
app.use('/api/admin/learning', adminRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    status: 0, 
    message: 'API endpoint not found',
    path: req.originalUrl 
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Global error handler:', err);
  res.status(err.status || 500).json({
    status: 0,
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

const PORT = process.env.PORT || 5001;

const startServer = async () => {
  try {
    // Test database connection
    const connection = await db.getConnection();
    console.log('✅ Database connected successfully');
    connection.release();
    
    app.listen(PORT, () => {
      console.log(`🚀 Satellite Streets Learning API running on port ${PORT}`);
      console.log(`📊 Health check: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

export default app;
