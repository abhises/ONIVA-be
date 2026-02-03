/**
 * Trip Routes
 * /api/trips/*
 */

const express = require('express');
const router = express.Router();
const Trip = require('../models/Trip');
const Driver = require('../models/Driver');
const { asyncHandler, AppError } = require('../middleware/errorHandler');

// Get trip details
router.get('/:tripId', asyncHandler(async (req, res) => {
  const trip = await Trip.findById(req.params.tripId);

  if (!trip) {
    throw new AppError('Trip not found', 404);
  }

  // Check authorization: client or driver can view
  if (trip.client_id !== req.userId && trip.driver_id !== req.userId) {
    throw new AppError('Unauthorized to view this trip', 403);
  }

  res.status(200).json({
    success: true,
    data: trip
  });
}));

// Get trip status
router.get('/:tripId/status', asyncHandler(async (req, res) => {
  const trip = await Trip.findById(req.params.tripId);

  if (!trip) {
    throw new AppError('Trip not found', 404);
  }

  res.status(200).json({
    success: true,
    data: {
      tripId: trip.id,
      status: trip.status,
      driverId: trip.driver_id,
      clientId: trip.client_id,
      updatedAt: trip.updated_at
    }
  });
}));

// Get driver details for trip
router.get('/:tripId/driver', asyncHandler(async (req, res) => {
  const trip = await Trip.findById(req.params.tripId);

  if (!trip) {
    throw new AppError('Trip not found', 404);
  }

  if (!trip.driver_id) {
    return res.status(200).json({
      success: true,
      data: null,
      message: 'No driver assigned yet'
    });
  }

  const driver = await Driver.findById(trip.driver_id);

  if (!driver) {
    throw new AppError('Driver not found', 404);
  }

  // Return only public driver info
  const publicDriverInfo = {
    driverId: driver.user_id,
    fullName: driver.full_name,
    phone: driver.phone,
    rating: driver.rating,
    profilePhoto: driver.profile_photo,
    currentLatitude: driver.current_latitude,
    currentLongitude: driver.current_longitude,
    isOnline: driver.is_online
  };

  res.status(200).json({
    success: true,
    data: publicDriverInfo
  });
}));

// Get trip route/track data
router.get('/:tripId/track', asyncHandler(async (req, res) => {
  // TODO: Fetch route waypoints from tracking table
  // For now, return mock data

  res.status(200).json({
    success: true,
    data: {
      tripId: req.params.tripId,
      route: [],
      lastUpdate: new Date().toISOString()
    }
  });
}));

// Submit trip feedback
router.post('/:tripId/feedback', asyncHandler(async (req, res) => {
  const { rating, comment, category } = req.body;

  if (!rating || rating < 1 || rating > 5) {
    throw new AppError('Rating must be between 1 and 5', 400);
  }

  const trip = await Trip.findById(req.params.tripId);

  if (!trip) {
    throw new AppError('Trip not found', 404);
  }

  if (trip.status !== 'completed') {
    throw new AppError('Can only submit feedback for completed trips', 400);
  }

  // TODO: Save feedback to database
  // await TripFeedback.create({
  //   tripId: trip.id,
  //   userId: req.userId,
  //   rating,
  //   comment,
  //   category,
  //   createdAt: new Date()
  // });

  res.status(201).json({
    success: true,
    message: 'Feedback submitted successfully'
  });
}));

// Report an issue with trip
router.post('/:tripId/report', asyncHandler(async (req, res) => {
  const { type, description, images } = req.body;

  if (!type || !description) {
    throw new AppError('Type and description are required', 400);
  }

  const validTypes = ['safety', 'behavior', 'vehicle', 'route', 'payment', 'other'];
  if (!validTypes.includes(type)) {
    throw new AppError('Invalid report type', 400);
  }

  const trip = await Trip.findById(req.params.tripId);

  if (!trip) {
    throw new AppError('Trip not found', 404);
  }

  // TODO: Save report to database
  // await TripReport.create({
  //   tripId: trip.id,
  //   reportedBy: req.userId,
  //   type,
  //   description,
  //   images,
  //   status: 'open'
  // });

  res.status(201).json({
    success: true,
    message: 'Report submitted successfully. Our team will review it.'
  });
}));

// Get trip receipt
router.get('/:tripId/receipt', asyncHandler(async (req, res) => {
  const trip = await Trip.findById(req.params.tripId);

  if (!trip) {
    throw new AppError('Trip not found', 404);
  }

  if (trip.status !== 'completed') {
    throw new AppError('Receipt only available for completed trips', 400);
  }

  const receipt = {
    tripId: trip.id,
    bookingType: trip.booking_type,
    date: trip.created_at,
    pickup: {
      address: trip.pickup_address,
      time: trip.created_at
    },
    destination: {
      address: trip.destination_address,
      time: trip.completed_at
    },
    durationMinutes: trip.actual_duration,
    distanceKm: trip.actual_distance,
    pricing: {
      basePrice: trip.base_price,
      totalPrice: trip.total_price,
      platformCommission: trip.platform_commission,
      paymentMethod: trip.payment_method,
      currency: 'XOF'
    },
    driver: {
      name: trip.driver_id ? 'Driver Name' : 'Unknown',
      phone: trip.driver_id ? 'Driver Phone' : 'Unknown'
    }
  };

  res.status(200).json({
    success: true,
    data: receipt
  });
}));

module.exports = router;