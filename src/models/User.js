/**
 * User Model
 * Handles user data operations
 */

const { query, transaction } = require('../config/database');
const bcrypt = require('bcrypt');
const logger = require('../utils/logger');

class User {
  static async findById(userId) {
    try {
      const result = await query(
        'SELECT id, phone, email, full_name, role, language, status, profile_photo, created_at, updated_at FROM users WHERE id = $1',
        [userId]
      );
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error finding user by ID:', error);
      throw error;
    }
  }

  static async findByPhone(phone) {
    try {
      const result = await query(
        'SELECT * FROM users WHERE phone = $1',
        [phone]
      );
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error finding user by phone:', error);
      throw error;
    }
  }

  static async create(userData) {
    const { phone, email, fullName, password, role, language } = userData;
    
    return transaction(async (client) => {
      try {
        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        const result = await client.query(
          `INSERT INTO users (phone, email, full_name, password_hash, role, language, status, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
           RETURNING id, phone, email, full_name, role, language, status, created_at`,
          [phone, email, fullName, hashedPassword, role, language, 'active']
        );

        logger.info('User created successfully', { userId: result.rows[0].id, role });
        return result.rows[0];
      } catch (error) {
        logger.error('Error creating user:', error);
        throw error;
      }
    });
  }

  static async updateProfile(userId, updates) {
    try {
      const allowedFields = ['full_name', 'email', 'language', 'profile_photo'];
      const setClause = [];
      const values = [];
      let paramCount = 1;

      for (const [key, value] of Object.entries(updates)) {
        if (allowedFields.includes(key) && value !== undefined) {
          setClause.push(`${key} = $${paramCount}`);
          values.push(value);
          paramCount++;
        }
      }

      if (setClause.length === 0) {
        return null;
      }

      values.push(userId);
      const query_str = `
        UPDATE users 
        SET ${setClause.join(', ')}, updated_at = NOW()
        WHERE id = $${paramCount}
        RETURNING *
      `;

      const result = await query(query_str, values);
      logger.info('User profile updated', { userId });
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error updating user profile:', error);
      throw error;
    }
  }

  static async verifyPassword(userId, password) {
    try {
      const result = await query(
        'SELECT password_hash FROM users WHERE id = $1',
        [userId]
      );

      if (!result.rows[0]) {
        return false;
      }

      return await bcrypt.compare(password, result.rows[0].password_hash);
    } catch (error) {
      logger.error('Error verifying password:', error);
      throw error;
    }
  }

  static async changePassword(userId, oldPassword, newPassword) {
    try {
      const isValid = await this.verifyPassword(userId, oldPassword);
      if (!isValid) {
        throw new Error('Current password is incorrect');
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await query(
        'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
        [hashedPassword, userId]
      );

      logger.info('Password changed', { userId });
      return true;
    } catch (error) {
      logger.error('Error changing password:', error);
      throw error;
    }
  }

  static async updateStatus(userId, status) {
    try {
      const result = await query(
        'UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
        [status, userId]
      );
      logger.info('User status updated', { userId, status });
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error updating user status:', error);
      throw error;
    }
  }

  static async setResetOTP(phone, otp, expiry) {
    try {
      await query(
        'UPDATE users SET reset_otp = $1, reset_otp_expires_at = $2 WHERE phone = $3',
        [otp, expiry, phone]
      );
      return true;
    } catch (error) {
      logger.error('Error setting reset OTP:', error);
      throw error;
    }
  }

  static async verifyResetOTP(phone, otp) {
    try {
      const result = await query(
        'SELECT id FROM users WHERE phone = $1 AND reset_otp = $2 AND reset_otp_expires_at > NOW()',
        [phone, otp]
      );
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error verifying reset OTP:', error);
      throw error;
    }
  }

  static async resetPassword(userId, newPassword) {
    try {
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await query(
        'UPDATE users SET password_hash = $1, reset_otp = NULL, reset_otp_expires_at = NULL, updated_at = NOW() WHERE id = $2',
        [hashedPassword, userId]
      );
      return true;
    } catch (error) {
      logger.error('Error resetting password:', error);
      throw error;
    }
  }
}

module.exports = User;