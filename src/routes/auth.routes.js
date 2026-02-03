/**
 * Authentication Routes
 * /api/auth/*
 */

const express = require('express');
const router = express.Router();
const AuthService = require('../services/auth.service');
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const { authenticate } = require('../middleware/auth');

// Register a new user
router.post('/register', asyncHandler(async (req, res) => {
  const { phone, fullName, password, role = 'client', language = 'en' } = req.body;

  // Validation
  if (!phone || !fullName || !password) {
    throw new AppError('Phone, full name, and password are required', 400);
  }

  if (!/^\+?[0-9]{9,15}$/.test(phone.replace(/\s+/g, ''))) {
    throw new AppError('Invalid phone number format', 400);
  }

  if (password.length < 6) {
    throw new AppError('Password must be at least 6 characters', 400);
  }

  if (!['client', 'driver', 'admin'].includes(role)) {
    throw new AppError('Invalid user role', 400);
  }

  const result = await AuthService.register(phone, fullName, password, role, language);

  res.status(201).json({
    success: true,
    message: 'User registered successfully',
    data: result
  });
}));

// Login user
router.post('/login', asyncHandler(async (req, res) => {
  const { phone, password } = req.body;

  if (!phone || !password) {
    throw new AppError('Phone and password are required', 400);
  }

  const result = await AuthService.login(phone, password);

  res.status(200).json({
    success: true,
    message: 'Login successful',
    data: result
  });
}));

// Refresh token
router.post('/refresh-token', asyncHandler(async (req, res) => {
  const { token } = req.body;

  if (!token) {
    throw new AppError('Token is required', 400);
  }

  const result = await AuthService.refreshToken(token);

  res.status(200).json({
    success: true,
    message: 'Token refreshed',
    data: result
  });
}));

// Verify token
router.post('/verify-token', asyncHandler(async (req, res) => {
  const { token } = req.body;

  if (!token) {
    throw new AppError('Token is required', 400);
  }

  const result = await AuthService.verifyToken(token);

  res.status(200).json({
    success: true,
    data: result
  });
}));

// Send OTP to phone
router.post('/send-otp', asyncHandler(async (req, res) => {
  const { phone } = req.body;

  if (!phone) {
    throw new AppError('Phone is required', 400);
  }

  const result = await AuthService.sendOTP(phone);

  res.status(200).json({
    success: true,
    message: 'OTP sent successfully',
    data: result
  });
}));

// Verify OTP
router.post('/verify-otp', asyncHandler(async (req, res) => {
  const { phone, otp } = req.body;

  if (!phone || !otp) {
    throw new AppError('Phone and OTP are required', 400);
  }

  const result = await AuthService.verifyOTP(phone, otp);

  res.status(200).json({
    success: true,
    message: 'OTP verified successfully',
    data: result
  });
}));

// Change password (protected)
router.post('/change-password', authenticate, asyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  const userId = req.userId;

  if (!oldPassword || !newPassword) {
    throw new AppError('Old and new password are required', 400);
  }

  if (newPassword.length < 6) {
    throw new AppError('New password must be at least 6 characters', 400);
  }

  const result = await AuthService.changePassword(userId, oldPassword, newPassword);

  res.status(200).json({
    success: true,
    message: result.message,
    data: result
  });
}));

module.exports = router;