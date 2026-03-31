/**
 * Admin Routes
 * /api/admin/*
 */

const express = require("express");
const router = express.Router();
const { authorize } = require("../middleware/auth");
const { asyncHandler, AppError } = require("../middleware/errorHandler");
const Driver = require("../models/Driver");
const Trip = require("../models/Trip");
const User = require("../models/User");
const PricingService = require("../services/pricing.service");
const { query } = require("../config/database");
const logger = require("../utils/logger");

// Middleware: Admin authorization
router.use(authorize("admin"));

// Dashboard metrics
router.get(
  "/dashboard",
  asyncHandler(async (req, res) => {
    const result = await query(`
      SELECT 
        -- all users except admin
        (SELECT COUNT(*) 
         FROM users 
         WHERE role != 'admin') AS totalUsers,

        -- all drivers
        (SELECT COUNT(*) 
         FROM users 
         WHERE role = 'driver') AS total_drivers,

        -- active drivers
        (SELECT COUNT(*) 
         FROM users 
         WHERE role = 'driver' 
           AND status = 'active') AS active_drivers,

        -- completed trips
        (SELECT COUNT(*) 
         FROM trips 
         WHERE status = 'completed') AS completed_trips,

        -- total revenue
        (SELECT COALESCE(SUM(total_price), 0) 
         FROM trips 
         WHERE status = 'completed') AS total_revenue,

        -- platform commission
        (SELECT COALESCE(SUM(platform_commission), 0) 
         FROM trips 
         WHERE status = 'completed') AS total_commission,

        -- today's trips
        (SELECT COUNT(*) 
         FROM trips 
         WHERE DATE(created_at) = CURRENT_DATE) AS todays_trips,

         (SELECT COUNT(*) 
          FROM drivers 
          WHERE verification_status = 'pending') AS pending_drivers,

        -- today's revenue
        (SELECT COALESCE(SUM(total_price), 0) 
         FROM trips 
         WHERE DATE(created_at) = CURRENT_DATE) AS todays_revenue,

        -- active trips
        (SELECT COUNT(*) 
         FROM trips 
         WHERE status IN ('pending', 'accepted', 'waiting_for_pickup', 'in_progress')) AS active_trips
    `);

    res.status(200).json({
      success: true,
      data: result.rows[0],
    });
  }),
);

// Get all drivers
router.get(
  "/drivers",
  asyncHandler(async (req, res) => {
    const limit = req.query.limit ? parseInt(req.query.limit) : 20;
    const offset = req.query.offset ? parseInt(req.query.offset) : 0;
    const status = req.query.status || "all";

    let statusFilter = "";
    if (status !== "all") {
      statusFilter = `AND d.verification_status = '${status}'`;
    }

    const result = await query(
      `
    SELECT d.*, u.phone, u.full_name, u.email, u.status
    FROM drivers d
    JOIN users u ON d.user_id = u.id
    ${statusFilter}
    ORDER BY d.created_at DESC
    LIMIT $1 OFFSET $2
  `,
      [limit, offset],
    );

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
        total: countResult.rows[0].total,
      },
    });
  }),
);

// Get driver details
router.get(
  "/drivers/:driverId",
  asyncHandler(async (req, res) => {
    const driver = await Driver.findById(req.params.driverId);

    if (!driver) {
      throw new AppError("Driver not found", 404);
    }

    // Get recent trips
    const trips = await Trip.getDriverTrips(req.params.driverId, 10);

    res.status(200).json({
      success: true,
      data: {
        driver,
        recentTrips: trips,
      },
    });
  }),
);

// Approve driver
router.post(
  "/drivers/:driverId/approve",
  asyncHandler(async (req, res) => {
    const updated = await Driver.updateVerificationStatus(
      req.params.driverId,
      "approved",
    );

    logger.info("Driver approved by admin", {
      driverId: req.params.driverId,
      adminId: req.userId,
    });

    res.status(200).json({
      success: true,
      message: "Driver approved successfully",
      data: updated,
    });
  }),
);

// Reject driver
router.post(
  "/drivers/:driverId/reject",
  asyncHandler(async (req, res) => {
    const { reason } = req.body;

    const updated = await Driver.updateVerificationStatus(
      req.params.driverId,
      "rejected",
    );

    logger.info("Driver rejected by admin", {
      driverId: req.params.driverId,
      reason,
    });

    res.status(200).json({
      success: true,
      message: "Driver rejected",
      data: updated,
    });
  }),
);

// Suspend driver
router.post(
  "/drivers/:driverId/suspend",
  asyncHandler(async (req, res) => {
    const { reason } = req.body;

    if (!reason) {
      throw new AppError("Suspension reason is required", 400);
    }

    await Driver.suspend(req.params.driverId, reason);

    logger.info("Driver suspended by admin", {
      driverId: req.params.driverId,
      reason,
    });

    res.status(200).json({
      success: true,
      message: "Driver suspended successfully",
    });
  }),
);

// Get all trips
router.get(
  "/trips",
  asyncHandler(async (req, res) => {
    const limit = req.query.limit ? parseInt(req.query.limit) : 20;
    const offset = req.query.offset ? parseInt(req.query.offset) : 0;
    const status = req.query.status || "all";

    let statusFilter = "";
    if (status !== "all") {
      statusFilter = `WHERE t.status = '${status}'`;
    }

    const result = await query(
      `
    SELECT t.*, u.full_name as client_name, d.user_id as driver_id
    FROM trips t
    JOIN users u ON t.client_id = u.id
    LEFT JOIN drivers d ON t.driver_id = d.user_id
    ${statusFilter}
    ORDER BY t.created_at DESC
    LIMIT $1 OFFSET $2
  `,
      [limit, offset],
    );

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
        total: countResult.rows[0].total,
      },
    });
  }),
);

// Get active trips map view
// router.get(
//   "/trips/live/active",
//   asyncHandler(async (req, res) => {
//     const activeTrips = await Trip.getActiveTrips();

//     res.status(200).json({
//       success: true,
//       data: activeTrips,
//     });
//   }),
// );

// Get trip details
router.get('/:id', asyncHandler(async (req, res, next) => {
  const tripId = req.params.id; // or req.params.tripId
  
  // ADD THIS CHECK:
  if (isNaN(parseInt(tripId, 10))) {
    // If it's not a number (like "active"), skip this route and let Express 
    // keep looking for another matching route down the chain.
    return next(); 
  }
    const trip = await Trip.findById(tripId);

    if (!trip) {
      throw new AppError("Trip not found", 404);
    }

    res.status(200).json({
      success: true,
      data: trip,
    });
  }),
);

// Get pricing configuration
// Get pricing configuration history
router.get(
  "/pricing/history",
  asyncHandler(async (req, res) => {
    const history = await PricingService.getPricingHistory();

    res.status(200).json({
      success: true,
      data: history,
    });
  }),
);

// Create and activate a NEW pricing configuration
// admin.js
router.post(
  "/pricing",
  asyncHandler(async (req, res) => {
    const {
      commission_percentage,
      base_fare,
      per_km_rate,
      minimum_fare,
      night_surcharge_percentage,
      long_distance_coefficient,
      hourly_rates // ADDED THIS
    } = req.body;

    if (!commission_percentage || !base_fare || !per_km_rate) {
      throw new AppError("Missing required pricing fields", 400);
    }

    const newConfig = await PricingService.createPricingConfig({
      commission_percentage,
      base_fare,
      per_km_rate,
      minimum_fare,
      night_surcharge_percentage,
      long_distance_coefficient,
      hourly_rates // ADDED THIS
    });

    res.status(201).json({
      success: true,
      message: "New pricing configuration applied successfully",
      data: newConfig,
    });
  }),
);

// Activate an older pricing configuration
router.put(
  "/pricing/:id/activate",
  asyncHandler(async (req, res) => {
    const configId = req.params.id;

    const activatedConfig = await PricingService.activatePricingConfig(configId);

    logger.info("Historical pricing config activated by admin", { 
      adminId: req.userId,
      configId 
    });

    res.status(200).json({
      success: true,
      message: "Historical pricing activated successfully",
      data: activatedConfig,
    });
  }),
);

// Summary Reports
router.get(
  "/reports/summary",
  asyncHandler(async (req, res) => {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      throw new AppError("startDate and endDate are required", 400);
    }

    const tripsResult = await query(
      `
      SELECT 
        COUNT(*) as total_trips,
        COALESCE(SUM(total_price), 0) as total_earnings,
        COALESCE(SUM(platform_commission), 0) as platform_commission,
        COALESCE(SUM(driver_earnings), 0) as driver_earnings,
        COALESCE(AVG(total_price), 0) as average_fare,
        COUNT(DISTINCT client_id) as active_users,
        COUNT(DISTINCT driver_id) as active_drivers
      FROM trips
      WHERE status = 'completed' AND created_at::date >= $1 AND created_at::date <= $2
      `,
      [startDate, endDate]
    );

    const ratingsResult = await query(
      `
      SELECT COALESCE(AVG(rating), 0) as average_rating
      FROM trip_ratings
      WHERE created_at::date >= $1 AND created_at::date <= $2
      `,
      [startDate, endDate]
    );

    const newUsersResult = await query(
      `
      SELECT COUNT(*) as new_users
      FROM users
      WHERE role = 'client' AND created_at::date >= $1 AND created_at::date <= $2
      `,
      [startDate, endDate]
    );

    const newDriversResult = await query(
      `
      SELECT COUNT(*) as new_drivers
      FROM users
      WHERE role = 'driver' AND created_at::date >= $1 AND created_at::date <= $2
      `,
      [startDate, endDate]
    );

    const data = {
      period: `${startDate} to ${endDate}`,
      totalTrips: parseInt(tripsResult.rows[0].total_trips) || 0,
      totalEarnings: parseFloat(tripsResult.rows[0].total_earnings) || 0,
      platformCommission: parseFloat(tripsResult.rows[0].platform_commission) || 0,
      driverEarnings: parseFloat(tripsResult.rows[0].driver_earnings) || 0,
      averageFare: parseFloat(tripsResult.rows[0].average_fare) || 0,
      averageRating: parseFloat(ratingsResult.rows[0].average_rating) || 0,
      activeUsers: parseInt(tripsResult.rows[0].active_users) || 0,
      activeDrivers: parseInt(tripsResult.rows[0].active_drivers) || 0,
      newUsers: parseInt(newUsersResult.rows[0].new_users) || 0,
      newDrivers: parseInt(newDriversResult.rows[0].new_drivers) || 0,
    };

    res.status(200).json({
      success: true,
      data
    });
  }),
);

// Revenue reports
router.get(
  "/reports/revenue",
  asyncHandler(async (req, res) => {
    const { startDate, endDate, period = "daily" } = req.query;

    if (!startDate || !endDate) {
      throw new AppError("startDate and endDate are required", 400);
    }

    let groupByClause = "DATE(created_at)";
    if (period === "weekly") {
      groupByClause = "DATE_TRUNC('week', created_at)";
    } else if (period === "monthly") {
      groupByClause = "DATE_TRUNC('month', created_at)";
    }

    const result = await query(
      `
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
  `,
      [startDate, endDate],
    );

    res.status(200).json({
      success: true,
      data: result.rows,
    });
  }),
);

// Regional reports
router.get(
  "/reports/regional",
  asyncHandler(async (req, res) => {
    const result = await query(`
      SELECT 
        t.region,
        COUNT(*) as trips,
        SUM(t.total_price) as total_revenue,
        SUM(t.platform_commission) as commission,
        COUNT(DISTINCT t.driver_id) as active_drivers
      FROM trips t
      WHERE t.status = 'completed'
      GROUP BY t.region
      ORDER BY total_revenue DESC
    `);

    res.status(200).json({
      success: true,
      data: result.rows,
    });
  }),
);

// Incident management
router.get(
  "/incidents",
  asyncHandler(async (req, res) => {
    const status = req.query.status || 'all';
    const tripId = req.query.tripId || null;
    const limit = req.query.limit ? parseInt(req.query.limit) : 50;
    const offset = req.query.offset ? parseInt(req.query.offset) : 0;

    const incidents = await Trip.getReports(status, limit, offset, tripId);
    res.status(200).json({ success: true, data: incidents });
  }),
);

router.get(
  "/incidents/:id",
  asyncHandler(async (req, res) => {
    const incident = await Trip.getReportById(req.params.id);
    if (!incident) {
      throw new AppError('Incident not found', 404);
    }
    res.status(200).json({ success: true, data: incident });
  }),
);

router.put(
  "/incidents/:id",
  asyncHandler(async (req, res) => {
    const { status, resolutionNote, action } = req.body;
    const validStatuses = ['open', 'investigating', 'resolved', 'closed', 'suspended'];

    if (!status || !validStatuses.includes(status)) {
      throw new AppError('Invalid incident status', 400);
    }

    const incident = await Trip.getReportById(req.params.id);
    if (!incident) {
      throw new AppError('Incident not found', 404);
    }

    const updatedIncident = await Trip.updateReportStatus(req.params.id, status, resolutionNote);

    if (status === 'suspended' || action === 'suspend_driver') {
      const driverId = incident.driver_id;
      if (driverId) {
        await Driver.suspend(driverId, resolutionNote || 'Suspended via incident workflow');
      }
    }

    res.status(200).json({ success: true, message: 'Incident updated', data: updatedIncident });
  }),
);

// Admin Earnings
router.get(
  "/earnings",
  asyncHandler(async (req, res) => {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      throw new AppError("startDate and endDate are required", 400);
    }

    const summaryResult = await query(
      `
      SELECT 
        COUNT(*) as total_trips,
        COALESCE(SUM(total_price), 0) as total_platform_earnings,
        COALESCE(SUM(driver_earnings), 0) as total_driver_earnings,
        COALESCE(SUM(platform_commission), 0) as total_commission,
        COALESCE(AVG(platform_commission), 0) as average_commission_per_trip
      FROM trips
      WHERE status = 'completed' AND created_at::date >= $1 AND created_at::date <= $2
      `,
      [startDate, endDate]
    );

    const monthlyResult = await query(
      `
      SELECT 
        TO_CHAR(DATE_TRUNC('month', created_at), 'FMMonth') as month,
        DATE_TRUNC('month', created_at) as month_val,
        COALESCE(SUM(total_price), 0) as platform_earnings,
        COALESCE(SUM(driver_earnings), 0) as driver_earnings,
        COALESCE(SUM(platform_commission), 0) as commission
      FROM trips
      WHERE status = 'completed' AND created_at::date >= $1 AND created_at::date <= $2
      GROUP BY DATE_TRUNC('month', created_at)
      ORDER BY month_val ASC
      `,
      [startDate, endDate]
    );

    const s = summaryResult.rows[0];
    const totalPlatformEarnings = parseFloat(s.total_platform_earnings) || 0;
    const totalCommission = parseFloat(s.total_commission) || 0;
    
    // Calculate effective commission rate, default to 25 if no trips
    const commissionPercentage = totalPlatformEarnings > 0 ? Math.round((totalCommission / totalPlatformEarnings) * 100) : 25;

    const data = {
      totalTrips: parseInt(s.total_trips) || 0,
      totalPlatformEarnings: totalPlatformEarnings,
      totalDriverEarnings: parseFloat(s.total_driver_earnings) || 0,
      totalCommission: totalCommission,
      commissionPercentage: commissionPercentage,
      averageCommissionPerTrip: Math.round(parseFloat(s.average_commission_per_trip)) || 0,
      monthlyData: monthlyResult.rows.map(row => ({
        month: row.month.trim(),
        platformEarnings: parseFloat(row.platform_earnings) || 0,
        driverEarnings: parseFloat(row.driver_earnings) || 0,
        commission: parseFloat(row.commission) || 0
      }))
    };

    res.status(200).json({
      success: true,
      data
    });
  }),
);

// User management
router.get(
  "/users",
  asyncHandler(async (req, res) => {
    const limit = req.query.limit ? parseInt(req.query.limit) : 20;
    const offset = req.query.offset ? parseInt(req.query.offset) : 0;
    const role = req.query.role || "all";

    let roleFilter = "";
    if (role !== "all") {
      roleFilter = `WHERE role = '${role}'`;
    }

    const result = await query(
      `
    SELECT id, phone, email, full_name, role, status, language, profile_photo, created_at
    FROM users
    ${roleFilter}
    ORDER BY created_at DESC
    LIMIT $1 OFFSET $2
  `,
      [limit, offset],
    );

    res.status(200).json({
      success: true,
      data: result.rows,
    });
  }),
);

// Get specific user details along with their trips
router.get(
  "/users/:userId",
  asyncHandler(async (req, res) => {
    const userResult = await query(
      `SELECT id, phone, email, full_name, role, status, language, profile_photo, created_at FROM users WHERE id = $1`,
      [req.params.userId]
    );

    if (userResult.rows.length === 0) {
      throw new AppError("User not found", 404);
    }

    const user = userResult.rows[0];
    let recentTrips = [];

    if (user.role === 'client') {
      recentTrips = await Trip.getClientTrips(user.id, 10);
    } else if (user.role === 'driver') {
      recentTrips = await Trip.getDriverTrips(user.id, 10);
    }

    res.status(200).json({
      success: true,
      data: {
        user,
        recentTrips
      }
    });
  })
);

// Suspend user
router.post(
  "/users/:userId/suspend",
  asyncHandler(async (req, res) => {
    const { reason } = req.body;

    const userResult = await query(`SELECT role FROM users WHERE id = $1`, [req.params.userId]);
    if (userResult.rows.length > 0 && userResult.rows[0].role === 'admin') {
      throw new AppError("Cannot suspend an admin user", 403);
    }

    await User.updateStatus(req.params.userId, "suspended");

    logger.info("User suspended by admin", {
      userId: req.params.userId,
      reason,
    });

    res.status(200).json({
      success: true,
      message: "User suspended successfully",
    });
  }),
);

// Get active trips with stats (for Admin Live Dashboard)
router.get(
  "/trips/active",
  asyncHandler(async (req, res) => {
    const limit = req.query.limit ? parseInt(req.query.limit) : 20;
    const offset = req.query.offset ? parseInt(req.query.offset) : 0;
    const statusFilter = req.query.status || "all";

    // 1. Map frontend simple statuses to DB statuses
    const statusMapping = {
      'scheduled': "('pending')",
      'assigned': "('accepted', 'waiting_for_pickup')",
      'started': "('in_progress')",
      'completed': "('completed')"
    };

    let dbStatusFilter = "t.status IN ('pending', 'accepted', 'waiting_for_pickup', 'in_progress', 'completed', 'cancelled')";
    if (statusFilter !== "all" && statusMapping[statusFilter]) {
      dbStatusFilter = `t.status IN ${statusMapping[statusFilter]}`;
    }

    // 2. Query to get formatted active trips (building nested JSON directly in Postgres)
    const tripsQuery = `
      SELECT 
        t.id, 
        CASE 
          WHEN t.status = 'pending' THEN 'scheduled'
          WHEN t.status IN ('accepted', 'waiting_for_pickup') THEN 'assigned'
          WHEN t.status = 'in_progress' THEN 'started'
          WHEN t.status = 'completed' THEN 'completed'
          WHEN t.status = 'cancelled' THEN 'cancelled'
        END as status,
        t.pickup_address as "pickupAddress", 
        t.destination_address as "dropoffAddress",
        t.estimated_distance as distance, 
        t.estimated_duration as duration, 
        t.total_price as "totalPrice",
        t.base_price as "baseFare", 
        t.platform_commission as "distanceCharge", 
        t.created_at as "createdAt",
        d.current_latitude as driverLatitude,
        d.current_longitude as driverLongitude,
        t.pickup_latitude as pickupLatitude,
        t.pickup_longitude as pickupLongitude,
        t.destination_latitude as destinationLatitude,
        t.destination_longitude as destinationLongitude,
        
        -- Build nested client object
        json_build_object(
          'id', c.id, 
          'name', c.full_name, 
          'phone', c.phone, 
          'email', c.email, 
          'rating', 5.0
        ) as client,
        
        -- Build nested driver object if driver exists
        CASE WHEN d.user_id IS NOT NULL THEN
          json_build_object(
            'id', d.user_id, 
            'name', u_d.full_name, 
            'phone', u_d.phone, 
            'isOnline', d.is_online,
            'location', json_build_object('latitude', d.current_latitude, 'longitude', d.current_longitude)
          )
        ELSE NULL END as driver
        
      FROM trips t
      JOIN users c ON t.client_id = c.id
      LEFT JOIN drivers d ON t.driver_id = d.user_id
      LEFT JOIN users u_d ON d.user_id = u_d.id
      WHERE ${dbStatusFilter}
      ORDER BY t.created_at DESC
      LIMIT $1 OFFSET $2
    `;

    const tripsResult = await query(tripsQuery, [limit, offset]);

    // 3. Query to calculate stats for the top cards
    const statsQuery = `
      SELECT 
        COUNT(*) FILTER (WHERE status = 'pending') as scheduled,
        COUNT(*) FILTER (WHERE status IN ('accepted', 'waiting_for_pickup')) as assigned,
        COUNT(*) FILTER (WHERE status = 'in_progress') as started,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) as total
      FROM trips
      WHERE status IN ('pending', 'accepted', 'waiting_for_pickup', 'in_progress', 'completed', 'cancelled')
    `;
    const statsResult = await query(statsQuery);

    // 4. Query to get total pagination count based on current filter
    const totalFilteredQuery = await query(`SELECT COUNT(*) as total FROM trips t WHERE ${dbStatusFilter}`);
    const totalFiltered = parseInt(totalFilteredQuery.rows[0].total);

    res.status(200).json({
      success: true,
      data: tripsResult.rows,
      stats: {
        scheduled: parseInt(statsResult.rows[0].scheduled) || 0,
        assigned: parseInt(statsResult.rows[0].assigned) || 0,
        started: parseInt(statsResult.rows[0].started) || 0,
        completed: parseInt(statsResult.rows[0].completed) || 0,
        total: parseInt(statsResult.rows[0].total) || 0
      },
      pagination: {
        limit,
        offset,
        total: totalFiltered,
        hasMore: (offset + limit) < totalFiltered
      }
    });
  })
);




module.exports = router;
