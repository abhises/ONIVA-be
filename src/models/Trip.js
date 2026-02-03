/**
 * Trip Model
 * Handles trip data and operations
 */

const { query, transaction } = require('../config/database');
const logger = require('../utils/logger');

class Trip {
  static async create(tripData) {
    const {
      clientId,
      driverId,
      bookingType, // 'point-to-point' or 'hourly'
      pickupLat,
      pickupLng,
      pickupAddress,
      destinationLat,
      destinationLng,
      destinationAddress,
      scheduledTime,
      estimatedDuration,
      estimatedDistance,
      basePrice,
      totalPrice,
      platformCommission,
      driverEarnings,
      paymentMethod,
      region
    } = tripData;

    return transaction(async (client) => {
      try {
        const result = await client.query(
          `INSERT INTO trips (
            client_id, driver_id, booking_type, pickup_latitude, pickup_longitude,
            pickup_address, destination_latitude, destination_longitude, destination_address,
            scheduled_time, estimated_duration, estimated_distance, base_price, total_price,
            platform_commission, driver_earnings, payment_method, region, status, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, NOW(), NOW())
          RETURNING *`,
          [
            clientId, driverId, bookingType, pickupLat, pickupLng, pickupAddress,
            destinationLat, destinationLng, destinationAddress, scheduledTime,
            estimatedDuration, estimatedDistance, basePrice, totalPrice,
            platformCommission, driverEarnings, paymentMethod, region, 'pending'
          ]
        );

        logger.info('Trip created', { tripId: result.rows[0].id, clientId, driverId });
        return result.rows[0];
      } catch (error) {
        logger.error('Error creating trip:', error);
        throw error;
      }
    });
  }

  static async findById(tripId) {
    try {
      const result = await query(
        `SELECT t.*, 
                c.full_name as client_name, c.phone as client_phone,
                d.user_id as driver_id_check
         FROM trips t
         JOIN users c ON t.client_id = c.id
         LEFT JOIN drivers d ON t.driver_id = d.user_id
         WHERE t.id = $1`,
        [tripId]
      );
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error finding trip:', error);
      throw error;
    }
  }

  static async updateStatus(tripId, status) {
    try {
      const result = await query(
        `UPDATE trips SET status = $1, updated_at = NOW()
         WHERE id = $2
         RETURNING *`,
        [status, tripId]
      );
      logger.info('Trip status updated', { tripId, status });
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error updating trip status:', error);
      throw error;
    }
  }

  static async recordOTPVerification(tripId, otp) {
    try {
      const result = await query(
        `UPDATE trips SET otp_verified = true, otp_verified_at = NOW(), status = 'in_progress'
         WHERE id = $1 AND otp_code = $2
         RETURNING *`,
        [tripId, otp]
      );

      if (result.rows.length === 0) {
        throw new Error('Invalid OTP or trip not found');
      }

      logger.info('OTP verified', { tripId });
      return result.rows[0];
    } catch (error) {
      logger.error('Error verifying OTP:', error);
      throw error;
    }
  }

  static async completeTrip(tripId, actualDistance, actualDuration, finalPrice) {
    return transaction(async (client) => {
      try {
        const result = await client.query(
          `UPDATE trips SET 
            status = 'completed',
            actual_distance = $1,
            actual_duration = $2,
            final_price = $3,
            completed_at = NOW(),
            updated_at = NOW()
           WHERE id = $4
           RETURNING *`,
          [actualDistance, actualDuration, finalPrice, tripId]
        );

        if (result.rows.length === 0) {
          throw new Error('Trip not found');
        }

        logger.info('Trip completed', { tripId, finalPrice });
        return result.rows[0];
      } catch (error) {
        logger.error('Error completing trip:', error);
        throw error;
      }
    });
  }

  static async cancelTrip(tripId, reason) {
    return transaction(async (client) => {
      try {
        const result = await client.query(
          `UPDATE trips SET status = 'cancelled', cancellation_reason = $1, updated_at = NOW()
           WHERE id = $2 AND status != 'completed'
           RETURNING *`,
          [reason, tripId]
        );

        if (result.rows.length === 0) {
          throw new Error('Cannot cancel completed trip');
        }

        logger.info('Trip cancelled', { tripId, reason });
        return result.rows[0];
      } catch (error) {
        logger.error('Error cancelling trip:', error);
        throw error;
      }
    });
  }

  static async getClientTrips(clientId, limit = 20, offset = 0) {
    try {
      const result = await query(
        `SELECT t.*, d.user_id as driver_id, u.full_name as driver_name, u.phone as driver_phone
         FROM trips t
         LEFT JOIN drivers d ON t.driver_id = d.user_id
         LEFT JOIN users u ON d.user_id = u.id
         WHERE t.client_id = $1
         ORDER BY t.created_at DESC
         LIMIT $2 OFFSET $3`,
        [clientId, limit, offset]
      );
      return result.rows;
    } catch (error) {
      logger.error('Error fetching client trips:', error);
      throw error;
    }
  }

  static async getDriverTrips(driverId, limit = 20, offset = 0) {
    try {
      const result = await query(
        `SELECT t.*, u.full_name as client_name, u.phone as client_phone
         FROM trips t
         JOIN users u ON t.client_id = u.id
         WHERE t.driver_id = $1
         ORDER BY t.created_at DESC
         LIMIT $2 OFFSET $3`,
        [driverId, limit, offset]
      );
      return result.rows;
    } catch (error) {
      logger.error('Error fetching driver trips:', error);
      throw error;
    }
  }

  static async getActiveTrips() {
    try {
      const result = await query(
        `SELECT t.*, 
                c.full_name as client_name, c.phone as client_phone,
                d.user_id as driver_id
         FROM trips t
         JOIN users c ON t.client_id = c.id
         LEFT JOIN drivers d ON t.driver_id = d.user_id
         WHERE t.status IN ('pending', 'accepted', 'in_progress', 'waiting_for_pickup')
         ORDER BY t.created_at DESC`
      );
      return result.rows;
    } catch (error) {
      logger.error('Error fetching active trips:', error);
      throw error;
    }
  }

  static async generateOTP(tripId) {
    try {
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      
      await query(
        `UPDATE trips SET otp_code = $1 WHERE id = $2`,
        [otp, tripId]
      );

      logger.debug('OTP generated', { tripId, otp });
      return otp;
    } catch (error) {
      logger.error('Error generating OTP:', error);
      throw error;
    }
  }
}

module.exports = Trip;