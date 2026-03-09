/**
 * Client Routes
 * /api/client/*
 */

const express = require('express');
const router = express.Router();
const Trip = require('../models/Trip');
const User = require('../models/User');
const Driver = require('../models/Driver'); // <--- ADD THIS LINE
const PricingService = require('../services/pricing.service');
const DispatchService = require('../services/dispatch.service');
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

// Get client profile
router.get('/profile', asyncHandler(async (req, res) => {
  const user = await User.findById(req.userId);

  if (!user) {
    throw new AppError('User not found', 404);
  }

  res.status(200).json({
    success: true,
    data: user
  });
}));

// Update client profile
router.put('/profile', asyncHandler(async (req, res) => {
  const { fullName, email, language } = req.body;
  
  const updated = await User.updateProfile(req.userId, {
    full_name: fullName,
    email,
    language
  });

  if (!updated) {
    throw new AppError('Failed to update profile', 400);
  }

  res.status(200).json({
    success: true,
    message: 'Profile updated successfully',
    data: updated
  });
}));

// Get fare estimate
router.post('/estimate-fare', asyncHandler(async (req, res) => {
  const { bookingType, distance, hours, pickupTime } = req.body;

  if (!bookingType || !['point-to-point', 'hourly'].includes(bookingType)) {
    throw new AppError('Invalid booking type', 400);
  }

  let fareEstimate;

  if (bookingType === 'point-to-point') {
    if (!distance || distance <= 0) {
      throw new AppError('Distance is required and must be positive', 400);
    }
    const isNight = PricingService.isNightTrip(pickupTime);
    fareEstimate = await PricingService.calculatePointToPointFare(distance, pickupTime, isNight);
  } else {
    if (!hours || hours <= 0) {
      throw new AppError('Hours is required and must be positive', 400);
    }
    const isNight = PricingService.isNightTrip(pickupTime);
    fareEstimate = await PricingService.calculateHourlyFare(hours, isNight);
  }

  // Calculate commission
  const commissionBreakdown = await PricingService.calculateCommission(fareEstimate.totalFare);

  res.status(200).json({
    success: true,
    data: {
      fareEstimate,
      commissionBreakdown
    }
  });
}));

// Get active pricing configuration
router.get('/pricing/active', asyncHandler(async (req, res) => {
  // This calls the existing method in your PricingService
  const activeConfig = await PricingService.getPricingConfig();

  res.status(200).json({
    success: true,
    data: activeConfig
  });
}));

// Book a trip
router.post('/book-trip', asyncHandler(async (req, res) => {
  const {
    bookingType,
    pickupLat,
    pickupLng,
    pickupAddress,
    destinationLat,
    destinationLng,
    destinationAddress,
    scheduledTime,
    distance,
    duration,
    basePrice,
    totalPrice,
    paymentMethod,
    region
  } = req.body;

  // Validation
  if (!bookingType || !['point-to-point', 'hourly'].includes(bookingType)) {
    throw new AppError('Invalid booking type', 400);
  }

  if (!pickupLat || !pickupLng || !region) {
    throw new AppError('Pickup location and region are required', 400);
  }

  if (bookingType === 'point-to-point' && (!destinationLat || !destinationLng)) {
    throw new AppError('Destination is required for point-to-point bookings', 400);
  }

  if (!paymentMethod || !['cash', 'mobile_money'].includes(paymentMethod)) {
    throw new AppError('Invalid payment method', 400);
  }

  // Calculate commission
  const commissionBreakdown = await PricingService.calculateCommission(totalPrice);

  // Create trip
  const trip = await Trip.create({
    clientId: req.userId,
    driverId: null,
    bookingType,
    pickupLat,
    pickupLng,
    pickupAddress,
    destinationLat: bookingType === 'point-to-point' ? destinationLat : null,
    destinationLng: bookingType === 'point-to-point' ? destinationLng : null,
    destinationAddress: bookingType === 'point-to-point' ? destinationAddress : null,
    scheduledTime: scheduledTime || new Date(),
    estimatedDuration: duration,
    estimatedDistance: distance,
    basePrice,
    totalPrice,
    platformCommission: commissionBreakdown.platformCommission,
    driverEarnings: commissionBreakdown.driverEarnings,
    paymentMethod,
    region
  });

  // Generate OTP
  const otp = await Trip.generateOTP(trip.id);

  // Start dispatch process
  const dispatchResult = await DispatchService.findAndAssignDriver({
    tripId: trip.id,
    pickupLat,
    pickupLng,
    region
  });

  res.status(201).json({
    success: true,
    message: 'Trip booked successfully',
    data: {
      trip,
      dispatchStatus: dispatchResult,
      otp // For development; remove in production
    }
  });
}));

// Get trip details
// Get trip details
router.get('/trips/:tripId', asyncHandler(async (req, res) => {
  const trip = await Trip.findById(req.params.tripId);

  // 1. ADD THESE LOGS to see exactly what is happening in your backend terminal
  console.log("---- DEBUGGING TRIP FETCH ----");
  console.log("Trip ID requested:", req.params.tripId);
  console.log("Trip found in DB:", trip ? "Yes" : "No");
  
  if (trip) {
    const ownerId = trip.client_id || trip.clientId; // handle both naming styles
    console.log("Trip Owner ID:", ownerId, "| Type:", typeof ownerId);
    console.log("Request User ID:", req.userId, "| Type:", typeof req.userId);
    
    // 2. USE LOOSE EQUALITY (!= instead of !==) or convert both to strings
    // This prevents 5 !== "5" from throwing an error
    if (String(ownerId) !== String(req.userId)) {
      console.log("❌ AUTHORIZATION FAILED: IDs do not match");
      throw new AppError('Trip not found or unauthorized', 404);
    }
  } else {
    console.log("❌ FAILED: Trip is null (not found in DB)");
    throw new AppError('Trip not found or unauthorized', 404);
  }

  console.log("✅ SUCCESS: Sending trip data");
  res.status(200).json({
    success: true,
    data: trip
  });
}));

// Get client's trip history
router.get('/trips', asyncHandler(async (req, res) => {
  const limit = req.query.limit ? parseInt(req.query.limit) : 20;
  const offset = req.query.offset ? parseInt(req.query.offset) : 0;

  const trips = await Trip.getClientTrips(req.userId, limit, offset);

  res.status(200).json({
    success: true,
    data: trips,
    pagination: {
      limit,
      offset
    }
  });
}));

// Rate a driver
router.post('/trips/:tripId/rate', asyncHandler(async (req, res) => {
  const { rating, review } = req.body;

  if (!rating || rating < 1 || rating > 5) {
    throw new AppError('Rating must be between 1 and 5', 400);
  }

  const trip = await Trip.findById(req.params.tripId);
  
  if (!trip || String(trip.client_id) !== String(req.userId)) {
    throw new AppError('Trip not found or unauthorized', 404);
  }

  if (trip.status !== 'completed') {
    throw new AppError('Can only rate completed trips', 400);
  }

  if (!trip.driver_id) {
    throw new AppError('No driver associated with this trip', 400);
  }

  // This will now work because Driver is defined
// In your router.post('/trips/:tripId/rate'...)
await Driver.updateRating(trip.driver_id, rating, review, trip.id, req.userId);
  res.status(200).json({
    success: true,
    message: 'Rating submitted successfully'
  });
}));
// Cancel a trip
router.post('/trips/:tripId/cancel', asyncHandler(async (req, res) => {
  const { reason } = req.body;

  const trip = await Trip.findById(req.params.tripId);
  if (!trip || trip.client_id !== req.userId) {
    throw new AppError('Trip not found or unauthorized', 404);
  }

  if (['completed', 'cancelled'].includes(trip.status)) {
    throw new AppError('Cannot cancel this trip', 400);
  }

  const cancelled = await Trip.cancelTrip(req.params.tripId, reason || 'Cancelled by client');

  res.status(200).json({
    success: true,
    message: 'Trip cancelled successfully',
    data: cancelled
  });
}));

// Start trip with OTP
router.post('/trips/:tripId/start-with-otp', asyncHandler(async (req, res) => {
  const { otp } = req.body;

  if (!otp) {
    throw new AppError('OTP is required', 400);
  }

  const trip = await Trip.recordOTPVerification(req.params.tripId, otp);

  if (!trip) {
    throw new AppError('Invalid OTP or trip not found', 400);
  }

  res.status(200).json({
    success: true,
    message: 'OTP verified. Trip started.',
    data: trip
  });
}));
// Get active pricing configuration
router.get('/pricing/active', asyncHandler(async (req, res) => {
  const activeConfig = await PricingService.getPricingConfig();
  res.status(200).json({
    success: true,
    data: activeConfig
  });
}));

module.exports = router;