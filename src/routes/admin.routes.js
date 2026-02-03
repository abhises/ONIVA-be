/**
 * Admin Routes
 * /api/admin/*
 */

const express = require('express');
const router = express.Router();
const { authorize } = require('../middleware/auth');
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const Driver = require('../models/Driver');
const Trip = require('../models/Trip');
const User = require('../models/User');
const PricingService = require('../services/pricing.service');
const { query } = require('../config/database');
const logger = require('../utils/logger');

// Middleware: Admin authorization
router.use(authorize('admin'));

// Dashboard metrics
router.get('/dashboard', asyncHandler(async (req, res) => {
  const result = await query(`
    SELECT 
      (SELECT COUNT(*) FROM users WHERE role = 'driver' AND status = 'active') as active_drivers,
      (SELECT COUNT(*) FROM trips WHERE status = 'completed') as completed_trips,
      (SELECT SUM(total_price) FROM trips WHERE status = 'completed') as total_revenue,
      (SELECT SUM(platform_commission) FROM trips WHERE status = 'completed') as total_commission,
      (SELECT COUNT(*) FROM trips WHERE DATE(created_at) = CURRENT_DATE) as todays_trips,
      (SELECT SUM(total_price) FROM trips WHERE DATE(created_at) = CURRENT_DATE) as todays_revenue
  `);

  res.status(200).json({
    success: true,
    data: result.rows[0]
  });
}));

// Get all drivers
router.get('/drivers', asyncHandler(async (req, res) => {
  const limit = req.query.limit ? parseInt(req.query.limit) : 20;
  const offset = req.query.offset ? parseInt(req.query.offset) : 0;
  const status = req.query.status || 'all';

  let statusFilter = '';
  if (status !== 'all') {
    statusFilter = `AND d.verification_status = '${status}'`;
  }

  const result = await query(`
    SELECT d.*, u.phone, u.full_name, u.email, u.status
    FROM drivers d
    JOIN users u ON d.user_id = u.id
    ${statusFilter}
    ORDER BY d.created_at DESC
    LIMIT $1 OFFSET $2
  `, [limit, offset]);

  const countResult = await query(`
    SELECT COUNT(*) as total FROM drivers d
    JOIN users u ON d.user_id = u.id
    ${statusFilter}
  `);

  res.status(200).json({
    success: true,
    data: result.rows,
    pagination: {
      limit,
      offset,
      total: countResult.rows[0].total
    }
  });
}));

// Get driver details
router.get('/drivers/:driverId', asyncHandler(async (req, res) => {
  const driver = await Driver.findById(req.params.driverId);

  if (!driver) {
    throw new AppError('Driver not found', 404);
  }

  // Get recent trips
  const trips = await Trip.getDriverTrips(req.params.driverId, 10);

  res.status(200).json({
    success: true,
    data: {
      driver,
      recentTrips: trips
    }
  });
}));

// Approve driver
router.post('/drivers/:driverId/approve', asyncHandler(async (req, res) => {
  const updated = await Driver.updateVerificationStatus(req.params.driverId, 'approved');

  logger.info('Driver approved by admin', { driverId: req.params.driverId, adminId: req.userId });

  res.status(200).json({
    success: true,
    message: 'Driver approved successfully',
    data: updated
  });
}));

// Reject driver
router.post('/drivers/:driverId/reject', asyncHandler(async (req, res) => {
  const { reason } = req.body;

  const updated = await Driver.updateVerificationStatus(req.params.driverId, 'rejected');

  logger.info('Driver rejected by admin', { driverId: req.params.driverId, reason });

  res.status(200).json({
    success: true,
    message: 'Driver rejected',
    data: updated
  });
}));

// Suspend driver
router.post('/drivers/:driverId/suspend', asyncHandler(async (req, res) => {
  const { reason } = req.body;

  if (!reason) {
    throw new AppError('Suspension reason is required', 400);
  }

  await Driver.suspend(req.params.driverId, reason);

  logger.info('Driver suspended by admin', { driverId: req.params.driverId, reason });

  res.status(200).json({
    success: true,
    message: 'Driver suspended successfully'
  });
}));

// Get all trips
router.get('/trips', asyncHandler(async (req, res) => {
  const limit = req.query.limit ? parseInt(req.query.limit) : 20;
  const offset = req.query.offset ? parseInt(req.query.offset) : 0;
  const status = req.query.status || 'all';

  let statusFilter = '';
  if (status !== 'all') {
    statusFilter = `WHERE t.status = '${status}'`;
  }

  const result = await query(`
    SELECT t.*, u.full_name as client_name, d.user_id as driver_id
    FROM trips t
    JOIN users u ON t.client_id = u.id
    LEFT JOIN drivers d ON t.driver_id = d.user_id
    ${statusFilter}
    ORDER BY t.created_at DESC
    LIMIT $1 OFFSET $2
  `, [limit, offset]);

  const countResult = await query(`
    SELECT COUNT(*) as total FROM trips t
    ${statusFilter}
  `);

  res.status(200).json({
    success: true,
    data: result.rows,
    pagination: {
      limit,
      offset,
      total: countResult.rows[0].total
    }
  });
}));

// Get active trips map view
router.get('/trips/live/active', asyncHandler(async (req, res) => {
  const activeTrips = await Trip.getActiveTrips();

  res.status(200).json({
    success: true,
    data: activeTrips
  });
}));

// Get trip details
router.get('/trips/:tripId', asyncHandler(async (req, res) => {
  const trip = await Trip.findById(req.params.tripId);

  if (!trip) {
    throw new AppError('Trip not found', 404);
  }

  res.status(200).json({
    success: true,
    data: trip
  });
}));

// Get pricing configuration
router.get('/pricing', asyncHandler(async (req, res) => {
  const config = await PricingService.getPricingConfig();

  res.status(200).json({
    success: true,
    data: config
  });
}));

// Update pricing configuration
router.put('/pricing', asyncHandler(async (req, res) => {
  const {
    commission_percentage,
    base_fare,
    per_km_rate,
    minimum_fare,
    night_surcharge_percentage,
    long_distance_coefficient
  } = req.body;

  if (!commission_percentage || !base_fare || !per_km_rate) {
    throw new AppError('Missing required pricing fields', 400);
  }

  const updated = await PricingService.updatePricingConfig({
    commission_percentage,
    base_fare,
    per_km_rate,
    minimum_fare,
    night_surcharge_percentage,
    long_distance_coefficient
  });

  logger.info('Pricing updated by admin', { adminId: req.userId });

  res.status(200).json({
    success: true,
    message: 'Pricing updated successfully',
    data: updated
  });
}));

// Revenue reports
router.get('/reports/revenue', asyncHandler(async (req, res) => {
  const { startDate, endDate, period = 'daily' } = req.query;

  if (!startDate || !endDate) {
    throw new AppError('startDate and endDate are required', 400);
  }

  let groupByClause = 'DATE(created_at)';
  if (period === 'weekly') {
    groupByClause = 'DATE_TRUNC(\'week\', created_at)';
  } else if (period === 'monthly') {
    groupByClause = 'DATE_TRUNC(\'month\', created_at)';
  }

  const result = await query(`
    SELECT 
      ${groupByClause} as period,
      COUNT(*) as trips,
      SUM(total_price) as total_revenue,
      SUM(platform_commission) as commission,
      AVG(total_price) as avg_trip_value
    FROM trips
    WHERE status = 'completed' AND created_at BETWEEN $1 AND $2
    GROUP BY ${groupByClause}
    ORDER BY period DESC
  `, [startDate, endDate]);

  res.status(200).json({
    success: true,
    data: result.rows
  });
}));

// Regional reports
router.get('/reports/regional', asyncHandler(async (req, res) => {
  const result = await query(`
    SELECT 
      t.region,
      COUNT(*) as trips,
      SUM(t.total_price) as total_revenue,
      SUM(t.platform_commission) as commission,
      COUNT(DISTINCT d.user_id) as active_drivers
    FROM trips t
    LEFT JOIN drivers d ON t.driver_id = d.user_id
    WHERE t.status = 'completed'
    GROUP BY t.region
    ORDER BY total_revenue DESC
  `);

  res.status(200).json({
    success: true,
    data: result.rows
  });
}));

// User management
router.get('/users', asyncHandler(async (req, res) => {
  const limit = req.query.limit ? parseInt(req.query.limit) : 20;
  const offset = req.query.offset ? parseInt(req.query.offset) : 0;
  const role = req.query.role || 'all';

  let roleFilter = '';
  if (role !== 'all') {
    roleFilter = `WHERE role = '${role}'`;
  }

  const result = await query(`
    SELECT id, phone, email, full_name, role, status, language, created_at
    FROM users
    ${roleFilter}
    ORDER BY created_at DESC
    LIMIT $1 OFFSET $2
  `, [limit, offset]);

  res.status(200).json({
    success: true,
    data: result.rows
  });
}));

// Suspend user
router.post('/users/:userId/suspend', asyncHandler(async (req, res) => {
  const { reason } = req.body;

  await User.updateStatus(req.params.userId, 'suspended');

  logger.info('User suspended by admin', { userId: req.params.userId, reason });

  res.status(200).json({
    success: true,
    message: 'User suspended successfully'
  });
}));

module.exports = router;