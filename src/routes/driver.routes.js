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

// Create driver profile
router.post('/profile', asyncHandler(async (req, res) => {
  const {
    nationalId,
    drivingLicense,
    licenseExpiry,
    profilePhoto,
    region,
    vehicleInfo
  } = req.body;

  if (!nationalId || !drivingLicense || !region || !vehicleInfo) {
    throw new AppError('Missing required fields for driver profile', 400);
  }

  const profile = await Driver.create(req.userId, {
    nationalId,
    drivingLicense,
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

  res.status(200).json({
    success: true,
    message: `Status set to ${isOnline ? 'online' : 'offline'}`,
    data: updated
  });
}));

// Get pending booking requests
router.get('/pending-requests', asyncHandler(async (req, res) => {
  const requests = await DispatchService.getPendingRequests(req.userId);

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

// Get active trip
router.get('/active-trip', asyncHandler(async (req, res) => {
  // TODO: Fetch the active trip for this driver
  // For now, return empty or implement logic

  res.status(200).json({
    success: true,
    data: null
  });
}));

// Start trip (verify OTP)
router.post('/trips/:tripId/start', asyncHandler(async (req, res) => {
  const { otp } = req.body;

  if (!otp) {
    throw new AppError('OTP is required', 400);
  }

  const trip = await Trip.findById(req.params.tripId);
  if (!trip || trip.driver_id !== req.userId) {
    throw new AppError('Trip not found or unauthorized', 404);
  }

  // Verify OTP
  if (trip.otp_code !== otp) {
    throw new AppError('Invalid OTP', 400);
  }

  const updated = await Trip.updateStatus(req.params.tripId, 'in_progress');

  res.status(200).json({
    success: true,
    message: 'Trip started',
    data: updated
  });
}));

// End trip
router.post('/trips/:tripId/end', asyncHandler(async (req, res) => {
  const { actualDistance, actualDuration, finalPrice } = req.body;

  const trip = await Trip.findById(req.params.tripId);
  if (!trip || trip.driver_id !== req.userId) {
    throw new AppError('Trip not found or unauthorized', 404);
  }

  if (trip.status !== 'in_progress') {
    throw new AppError('Trip is not in progress', 400);
  }

  const completed = await Trip.completeTrip(
    req.params.tripId,
    actualDistance,
    actualDuration,
    finalPrice || trip.total_price
  );

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

module.exports = router;