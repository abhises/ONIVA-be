/**
 * ONIVA Backend - Main Application
 * Module 5: On-Demand Personal Driver
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config();

// Import routes
const authRoutes = require('./routes/auth.routes');
const clientRoutes = require('./routes/client.routes');
const driverRoutes = require('./routes/driver.routes');
const tripRoutes = require('./routes/trip.routes');
const adminRoutes = require('./routes/admin.routes');
const locationRoutes = require('./routes/location.routes');

// Import middleware
const { errorHandler } = require('./middleware/errorHandler');
const { authenticate } = require('./middleware/auth');

// Initialize Express app
const app = express();

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// API Routes (Public)
app.use('/api/auth', authRoutes);

// Protected Routes (Require Authentication)
app.use('/api/client', authenticate, clientRoutes);
app.use('/api/driver', authenticate, driverRoutes);
app.use('/api/trips', authenticate, tripRoutes);
app.use('/api/location', authenticate, locationRoutes);
app.use('/api/admin', authenticate, adminRoutes); // Admin routes should have role check

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    path: req.path
  });
});

// Error handling middleware (must be last)
app.use(errorHandler);

module.exports = app;