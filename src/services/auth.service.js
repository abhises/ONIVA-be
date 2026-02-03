/**
 * Authentication Service
 * Handles user registration, login, and token management
 */

const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../utils/logger');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const JWT_EXPIRY = process.env.JWT_EXPIRY || '7d';

class AuthService {
  static generateToken(user) {
    const payload = {
      id: user.id,
      phone: user.phone,
      role: user.role,
      language: user.language
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRY });
    logger.debug('Token generated', { userId: user.id, role: user.role });
    return token;
  }

  static async register(phone, fullName, password, role = 'client', language = 'en') {
    try {
      // Check if user already exists
      const existingUser = await User.findByPhone(phone);
      if (existingUser) {
        throw new Error('User with this phone number already exists');
      }

      // Create new user
      const user = await User.create({
        phone,
        fullName,
        password,
        role,
        language,
        email: null
      });

      // Generate token
      const token = this.generateToken(user);

      logger.info('User registered successfully', { userId: user.id, role });
      return {
        success: true,
        user: {
          id: user.id,
          phone: user.phone,
          fullName: user.full_name,
          role: user.role,
          language: user.language
        },
        token
      };
    } catch (error) {
      logger.error('Registration failed:', error.message);
      throw error;
    }
  }

  static async login(phone, password) {
    try {
      // Find user by phone
      const user = await User.findByPhone(phone);
      if (!user) {
        throw new Error('Invalid phone number or password');
      }

      // Verify password
      const isPasswordValid = await User.verifyPassword(user.id, password);
      if (!isPasswordValid) {
        throw new Error('Invalid phone number or password');
      }

      // Check user status
      if (user.status !== 'active') {
        throw new Error('User account is inactive');
      }

      // Generate token
      const token = this.generateToken(user);

      logger.info('User logged in successfully', { userId: user.id, role: user.role });
      return {
        success: true,
        user: {
          id: user.id,
          phone: user.phone,
          fullName: user.full_name,
          role: user.role,
          language: user.language,
          status: user.status
        },
        token
      };
    } catch (error) {
      logger.warn('Login failed:', { phone, error: error.message });
      throw error;
    }
  }

  static async refreshToken(token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const user = await User.findById(decoded.id);

      if (!user || user.status !== 'active') {
        throw new Error('User not found or inactive');
      }

      const newToken = this.generateToken(user);
      logger.debug('Token refreshed', { userId: user.id });

      return {
        success: true,
        token: newToken
      };
    } catch (error) {
      logger.warn('Token refresh failed:', error.message);
      throw error;
    }
  }

  static async verifyToken(token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      return {
        valid: true,
        decoded
      };
    } catch (error) {
      return {
        valid: false,
        error: error.message
      };
    }
  }

  static async sendOTP(phone) {
    // TODO: Integrate with SMS service (Twilio, Africa's Talking, etc.)
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    logger.info('OTP generated for phone verification', { phone, otp });
    
    // In production, send via SMS
    // await SMSService.send(phone, `Your ONIVA OTP is: ${otp}`);

    return {
      success: true,
      message: 'OTP sent to phone number',
      otp // Remove in production
    };
  }

  static async verifyOTP(phone, otp) {
    // TODO: Verify OTP from database/cache
    // In production, check against stored OTP with expiry
    logger.info('OTP verified', { phone });
    return {
      success: true,
      message: 'Phone number verified'
    };
  }

  static async changePassword(userId, oldPassword, newPassword) {
    try {
      await User.changePassword(userId, oldPassword, newPassword);
      logger.info('Password changed', { userId });
      return {
        success: true,
        message: 'Password changed successfully'
      };
    } catch (error) {
      logger.error('Password change failed:', error.message);
      throw error;
    }
  }
}

module.exports = AuthService;