/**
 * Driver Routes
 * /api/driver/*
 */

const express = require('express');
const router = express.Router();
const Driver = require('../models/Driver');
const Trip = require('../models/Trip');
const User = require('../models/User');
const DispatchService = require('../services/dispatch.service');
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const { authorize } = require('../middleware/auth');
const socketService = require('../services/socket.service');

// Create driver profile
// Create driver profile
router.post('/profile', asyncHandler(async (req, res) => {
  const {
    nationalId,
    drivingLicense,
    nationalIdUrl,      // NEW: Added from Step 2 of frontend
    drivingLicenseUrl,   // NEW: Added from Step 2 of frontend
    licenseExpiry,
    profilePhoto,
    region,
    vehicleInfo
  } = req.body;

  // Validate that we have the numbers AND the document links
  if (!nationalId || !drivingLicense || !nationalIdUrl || !drivingLicenseUrl || !region || !vehicleInfo) {
    throw new AppError('Missing required fields or document uploads', 400);
  }

  const profile = await Driver.create(req.userId, {
    nationalId,
    drivingLicense,
    nationalIdUrl,     // Pass to model
    drivingLicenseUrl,  // Pass to model
    licenseExpiry,
    profilePhoto,
    region,
    vehicleInfo
  });

  res.status(201).json({
    success: true,
    message: 'Driver profile created. Pending verification.',
    data: profile
  });
}));

// Get driver profile
router.get('/profile', asyncHandler(async (req, res) => {
  const driver = await Driver.findById(req.userId);

  if (!driver) {
    throw new AppError('Driver profile not found', 404);
  }

  res.status(200).json({
    success: true,
    data: driver
  });
}));

// Update driver profile
router.put('/profile', asyncHandler(async (req, res) => {
  await Driver.updateProfile(req.userId, req.body);
  const updatedDriver = await Driver.findById(req.userId);
  res.status(200).json({
    success: true,
    message: 'Driver profile updated',
    data: updatedDriver
  });
}));

// Update location (real-time)
router.post('/location', asyncHandler(async (req, res) => {
  const { latitude, longitude } = req.body;

  if (latitude === undefined || longitude === undefined) {
    throw new AppError('Latitude and longitude are required', 400);
  }

  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    throw new AppError('Invalid coordinates', 400);
  }

  const updated = await Driver.updateLocation(req.userId, latitude, longitude);
  
  // Real-time broadcast for admin and active trip tracking
  try {
    socketService.getIO().emit('driver_location_updated', {
      driverId: req.userId,
      latitude,
      longitude,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error broadcasting location update:', error.message);
  }

  res.status(200).json({
    success: true,
    data: updated
  });
}));

// Set online/offline status
router.post('/status', asyncHandler(async (req, res) => {
  const { isOnline } = req.body;

  if (typeof isOnline !== 'boolean') {
    throw new AppError('isOnline must be a boolean', 400);
  }

  const updated = await Driver.setOnlineStatus(req.userId, isOnline);

  // Broadcast status change
  try {
    socketService.getIO().emit('driver_status_changed', {
      driverId: req.userId,
      isOnline,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error broadcasting status update:', error.message);
  }

  res.status(200).json({
    success: true,
    message: `Status set to ${isOnline ? 'online' : 'offline'}`,
    data: updated
  });
}));

// Get pending booking requests
router.get('/pending-requests', asyncHandler(async (req, res) => {
  const requests = await DispatchService.getPendingRequests(req.userId);
  
  console.log(`📡 [API] Fetching pending requests for Driver: ${req.userId} | Found: ${requests.length}`);
  
  res.status(200).json({
    success: true,
    data: requests
  });
}));

// Accept a booking request
router.post('/requests/:requestId/accept', asyncHandler(async (req, res) => {
  const request = await DispatchService.acceptBooking(
    req.params.requestId,
    req.userId
  );

  res.status(200).json({
    success: true,
    message: 'Booking accepted',
    data: request
  });
}));

// Reject a booking request
router.post('/requests/:requestId/reject', asyncHandler(async (req, res) => {
  const { reason } = req.body;

  const request = await DispatchService.rejectBooking(
    req.params.requestId,
    req.userId,
    reason || 'Driver rejected'
  );

  res.status(200).json({
    success: true,
    message: 'Booking rejected',
    data: request
  });
}));

router.get('/requests/:id', asyncHandler(async (req, res) => {
  const requestDetails = await DispatchService.getRequestById(req.params.id, req.userId);

  if (!requestDetails) {
    return res.status(404).json({ success: false, message: "Request not found" });
  }

  res.status(200).json({
    success: true,
    data: requestDetails
  });
}));

// Get active trip
// Get active trip for the logged-in driver
router.get('/active-trip', asyncHandler(async (req, res) => {
  const trip = await Trip.findActiveByDriverId(req.userId);

  res.status(200).json({
    success: true,
    data: trip // This will return the trip object or null if they are idle
  });
}));

// Start trip (verify OTP)
router.post('/trips/:tripId/start', asyncHandler(async (req, res) => {
  const { otp } = req.body;
  const tripId = req.params.tripId;

  if (!otp) {
    throw new AppError('OTP is required', 400);
  }

  // 1. Fetch the trip to verify ownership and the OTP code
  const trip = await Trip.findById(tripId);
  if (!trip || trip.driver_id !== req.userId) {
    throw new AppError('Trip not found or unauthorized', 404);
  }

  // 2. Verify OTP matches what the client gave the driver
  if (trip.otp_code !== otp) {
    throw new AppError('Invalid OTP', 400);
  }

  // 3. Perform all database updates in one shot
  const updatedTrip = await Trip.startTrip(tripId);

  // 4. Fire the socket event to let the client know the ride has begun
  try {
    socketService.getIO().emit('trip_status_changed', {
      tripId: tripId,
      status: 'in_progress',
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error("Socket emit failed:", err);
  }

  // 5. Return success!
  res.status(200).json({
    success: true,
    message: 'Trip started successfully',
    data: updatedTrip
  });
}));

// End trip
router.post('/trips/:tripId/end', asyncHandler(async (req, res) => {
  const { actualDistance, actualDuration, finalPrice } = req.body;
  const tripId = req.params.tripId; // Extracted for cleaner code

  const trip = await Trip.findById(tripId);
  if (!trip || trip.driver_id !== req.userId) {
    throw new AppError('Trip not found or unauthorized', 404);
  }

  if (trip.status !== 'in_progress') {
    throw new AppError('Trip is not in progress', 400);
  }

  // 1. Update the database
  const completed = await Trip.completeTrip(
    tripId,
    actualDistance,
    actualDuration,
    finalPrice || trip.total_price
  );

  // 🟢 2. FIRE THE SOCKET EVENT 🟢
  try {
    socketService.getIO().emit('trip_status_changed', {
      tripId: tripId,
      status: 'completed', // Tells the frontend the ride is over
      finalPrice: finalPrice || trip.total_price,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error("Socket emit failed:", err);
  }

  // 3. Send response to driver
  res.status(200).json({
    success: true,
    message: 'Trip completed',
    data: completed
  });
}));

// Get driver's trip history
router.get('/trips', asyncHandler(async (req, res) => {
  const limit = req.query.limit ? parseInt(req.query.limit) : 20;
  const offset = req.query.offset ? parseInt(req.query.offset) : 0;

  const trips = await Trip.getDriverTrips(req.userId, limit, offset);

  res.status(200).json({
    success: true,
    data: trips,
    pagination: {
      limit,
      offset
    }
  });
}));

// Get earnings summary
router.get('/earnings', asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;

  if (!startDate || !endDate) {
    throw new AppError('startDate and endDate are required', 400);
  }

  const earnings = await Driver.getEarnings(req.userId, startDate, endDate);

  res.status(200).json({
    success: true,
    data: earnings
  });
}));

// Get today's earnings
router.get('/earnings/today', asyncHandler(async (req, res) => {
  const today = new Date();
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

  const earnings = await Driver.getEarnings(req.userId, startOfDay, endOfDay);

  res.status(200).json({
    success: true,
    data: earnings
  });
}));

// Get driver dashboard overview stats
router.get('/dashboard-stats', asyncHandler(async (req, res) => {
  const stats = await Driver.getDashboardStats(req.userId);

  res.status(200).json({
    success: true,
    data: stats
  });
}));

router.get('/checkDriverCreation', asyncHandler(async (req, res) => {
  const result = await Driver.checkDriverCreation(req.userId);

  res.status(200).json({
    success: true,
    data: {                // <--- Wrap the payload in 'data'
      status: result.status 
    }
  });
}));

module.exports = router;