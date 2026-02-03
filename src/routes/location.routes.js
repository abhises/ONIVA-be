/**
 * Location Routes
 * /api/location/*
 */

const express = require('express');
const router = express.Router();
const { asyncHandler, AppError } = require('../middleware/errorHandler');

// Geocode address to coordinates
router.post('/geocode', asyncHandler(async (req, res) => {
  const { address } = req.body;

  if (!address) {
    throw new AppError('Address is required', 400);
  }

  // TODO: Integrate with Google Maps / Mapbox API
  // For now, return mock response
  const mockResult = {
    address,
    latitude: 14.7167,
    longitude: -17.5333,
    accuracy: 'rooftop',
    placeId: 'mock_place_id'
  };

  res.status(200).json({
    success: true,
    data: mockResult
  });
}));

// Reverse geocode coordinates to address
router.post('/reverse-geocode', asyncHandler(async (req, res) => {
  const { latitude, longitude } = req.body;

  if (latitude === undefined || longitude === undefined) {
    throw new AppError('Latitude and longitude are required', 400);
  }

  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    throw new AppError('Invalid coordinates', 400);
  }

  // TODO: Integrate with Google Maps / Mapbox API
  // For now, return mock response
  const mockResult = {
    latitude,
    longitude,
    address: 'Downtown Dakar, Senegal',
    formattedAddress: 'Dakar, Senegal',
    components: {
      city: 'Dakar',
      region: 'Dakar',
      country: 'Senegal'
    }
  };

  res.status(200).json({
    success: true,
    data: mockResult
  });
}));

// Calculate distance between two points
router.post('/distance', asyncHandler(async (req, res) => {
  const { startLat, startLng, endLat, endLng } = req.body;

  if (startLat === undefined || startLng === undefined || endLat === undefined || endLng === undefined) {
    throw new AppError('Start and end coordinates are required', 400);
  }

  // TODO: Integrate with distance matrix API
  // Haversine formula for mock calculation
  const distance = calculateDistance(startLat, startLng, endLat, endLng);

  res.status(200).json({
    success: true,
    data: {
      distance: parseFloat(distance.toFixed(2)),
      unit: 'km'
    }
  });
}));

// Calculate route and duration
router.post('/route', asyncHandler(async (req, res) => {
  const { startLat, startLng, endLat, endLng } = req.body;

  if (startLat === undefined || startLng === undefined || endLat === undefined || endLng === undefined) {
    throw new AppError('Start and end coordinates are required', 400);
  }

  // TODO: Integrate with routing API (Google Directions, OSRM, etc.)
  const distance = calculateDistance(startLat, startLng, endLat, endLng);
  const estimatedDuration = Math.ceil(distance * 3); // Mock: 3 minutes per km

  const mockResult = {
    distance: parseFloat(distance.toFixed(2)),
    duration: estimatedDuration,
    durationMinutes: Math.ceil(estimatedDuration / 60),
    route: {
      startPoint: { latitude: startLat, longitude: startLng },
      endPoint: { latitude: endLat, longitude: endLng },
      waypoints: []
    }
  };

  res.status(200).json({
    success: true,
    data: mockResult
  });
}));

// Search places/autocomplete
router.get('/search-places', asyncHandler(async (req, res) => {
  const { query, latitude, longitude } = req.query;

  if (!query) {
    throw new AppError('Query is required', 400);
  }

  // TODO: Integrate with Google Places / Nominatim API
  const mockResults = [
    {
      placeId: '1',
      name: `${query} Street, Dakar`,
      address: `${query} Street, Dakar, Senegal`,
      latitude: 14.7167,
      longitude: -17.5333,
      type: 'street_address'
    },
    {
      placeId: '2',
      name: `${query} Avenue`,
      address: `${query} Avenue, Dakar, Senegal`,
      latitude: 14.7180,
      longitude: -17.5350,
      type: 'route'
    }
  ];

  res.status(200).json({
    success: true,
    data: mockResults
  });
}));

// Helper function to calculate distance using Haversine formula
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

module.exports = router;