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
         WHERE DATE(created_at) = CURRENT_DATE) AS todays_revenue
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
router.get(
  "/trips/live/active",
  asyncHandler(async (req, res) => {
    const activeTrips = await Trip.getActiveTrips();

    res.status(200).json({
      success: true,
      data: activeTrips,
    });
  }),
);

// Get trip details
router.get(
  "/trips/:tripId",
  asyncHandler(async (req, res) => {
    const trip = await Trip.findById(req.params.tripId);

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
    SELECT id, phone, email, full_name, role, status, language, created_at
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

// Suspend user
router.post(
  "/users/:userId/suspend",
  asyncHandler(async (req, res) => {
    const { reason } = req.body;

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


router.get(
  '/trips/active',
  asyncHandler(async (req, res) => {
    const limit = req.query.limit ? parseInt(req.query.limit) : 20;
    const offset = req.query.offset ? parseInt(req.query.offset) : 0;
    const status = req.query.status || 'all';

    // Call the model
    const { trips, total } = await Trip.getActiveTrips(limit, offset, status);

    return res.status(200).json({})

    // Format response
    // const activeTrips = trips.map(trip => ({
    //   id: trip.id,
    //   status: trip.status,
    //   bookingType: trip.booking_type,
      
    //   pickupAddress: trip.pickup_address,
    //   dropoffAddress: trip.dropoff_address,
    //   distance: trip.distance,
    //   duration: trip.duration,
      
    //   totalPrice: trip.total_price,
    //   baseFare: trip.base_fare,
    //   distanceCharge: trip.distance_charge,
    //   surcharge: trip.surcharge,
      
    //   createdAt: trip.created_at,
    //   assignedAt: trip.assigned_at,
    //   startedAt: trip.started_at,
    //   completedAt: trip.completed_at,
    //   cancelledAt: trip.cancelled_at,
      
    //   client: trip.client_id ? {
    //     id: trip.client_id,
    //     name: trip.client_name,
    //     phone: trip.client_phone,
    //     email: trip.client_email,
    //     rating: trip.client_rating
    //   } : null,
      
    //   driver: trip.driver_id ? {
    //     id: trip.driver_id,
    //     name: trip.driver_name,
    //     phone: trip.driver_phone,
    //     email: trip.driver_email,
    //     rating: trip.driver_rating,
    //     isOnline: trip.driver_is_online,
    //     car: trip.car_model ? {
    //       model: trip.car_model,
    //       licensePlate: trip.license_plate,
    //       color: trip.car_color
    //     } : null
    //   } : null
    // }));

    // res.status(200).json({
    //   success: true,
    //   data: activeTrips,
    //   pagination: {
    //     limit: limit,
    //     offset: offset,
    //     total: total,
    //     hasMore: offset + limit < total
    //   },
    //   stats: {
    //     scheduled: trips.filter(t => t.status === 'scheduled').length,
    //     assigned: trips.filter(t => t.status === 'assigned').length,
    //     started: trips.filter(t => t.status === 'started').length,
    //     total: trips.length
    //   }
    // });
  })
);



/**
 * Get trip statistics (dashboard metrics)
 * GET /api/admin/trips/statistics
 */
router.get(
  '/statistics',
  asyncHandler(async (req, res) => {
    
    // Call the model
    const result = await Trip.getDashboardStatistics();

    res.status(200).json({
      success: true,
      data: {
        active: {
          scheduled: parseInt(result.scheduled_count || 0),
          assigned: parseInt(result.assigned_count || 0),
          started: parseInt(result.started_count || 0),
          total: parseInt(result.active_trips || 0)
        },
        completed: {
          count: parseInt(result.completed_count || 0),
          revenue: parseFloat(result.total_revenue || 0),
          averageFare: parseFloat(result.avg_fare || 0),
          totalDistance: parseFloat(result.total_distance || 0),
          averageDistance: parseFloat(result.avg_distance || 0),
          averageDuration: parseFloat(result.avg_duration || 0)
        },
        cancelled: parseInt(result.cancelled_count || 0),
        total: parseInt(result.total_trips || 0)
      },
      timeframe: 'Last 24 hours'
    });
  })
);
/**
 * Get trip details (admin view)
 * GET /api/admin/trips/:tripId
 */
router.get(
  '/trips/:tripId',
  asyncHandler(async (req, res) => {
    const tripId = req.params.tripId;

    // Call the model
    const trip = await Trip.getAdminTripDetails(tripId);

    if (!trip) {
      return res.status(404).json({
        success: false,
        message: 'Trip not found'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        id: trip.id,
        status: trip.status,
        bookingType: trip.booking_type,
        
        pickupAddress: trip.pickup_address,
        dropoffAddress: trip.dropoff_address,
        pickupLatitude: trip.pickup_latitude,
        pickupLongitude: trip.pickup_longitude,
        dropoffLatitude: trip.dropoff_latitude,
        dropoffLongitude: trip.dropoff_longitude,
        distance: trip.distance,
        duration: trip.duration,
        
        totalPrice: trip.total_price,
        baseFare: trip.base_fare,
        distanceCharge: trip.distance_charge,
        surcharge: trip.surcharge,
        commission: trip.commission,
        
        createdAt: trip.created_at,
        assignedAt: trip.assigned_at,
        startedAt: trip.started_at,
        completedAt: trip.completed_at,
        cancelledAt: trip.cancelled_at,
        cancellationReason: trip.cancellation_reason,
        
        client: {
          id: trip.client_id,
          name: trip.client_name,
          phone: trip.client_phone,
          email: trip.client_email,
          rating: trip.client_rating,
          status: trip.client_status
        },
        
        driver: trip.driver_id ? {
          id: trip.driver_id,
          name: trip.driver_name,
          phone: trip.driver_phone,
          email: trip.driver_email,
          rating: trip.driver_rating,
          status: trip.driver_status,
          isOnline: trip.driver_is_online,
          totalTrips: trip.driver_total_trips,
          totalEarnings: trip.driver_total_earnings,
          car: trip.car_model ? {
            model: trip.car_model,
            licensePlate: trip.license_plate,
            color: trip.car_color
          } : null
        } : null,
        
        rating: trip.client_rating_given ? {
          rating: trip.client_rating_given,
          review: trip.client_review,
          createdAt: trip.rating_date
        } : null
      }
    });
  })
);

module.exports = router;
