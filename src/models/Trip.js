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
                u_d.full_name as driver_name, u_d.phone as driver_phone,
                d.vehicle_info, d.profile_photo as driver_photo, d.rating as driver_avg_rating,
                tr.rating as rating_value, 
                tr.review as rating_review, 
                tr.created_at as rating_created_at
         FROM trips t
         JOIN users c ON t.client_id = c.id
         LEFT JOIN drivers d ON t.driver_id = d.user_id
         LEFT JOIN users u_d ON d.user_id = u_d.id
         LEFT JOIN trip_ratings tr ON t.id = tr.trip_id
         WHERE t.id = $1`,
        [tripId]
      );

      const trip = result.rows[0];
      if (trip && trip.rating_value) {
        trip.rating = {
          rating: trip.rating_value,
          review: trip.rating_review,
          created_at: trip.rating_created_at
        };
      }
      return trip || null;
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

  static async startTrip(tripId) {
    try {
      const result = await query(
        `UPDATE trips 
         SET status = 'in_progress', 
             otp_verified = true,
             updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [tripId]
      );

      return result.rows[0];
    } catch (error) {
      logger.error('Error starting trip:', error);
      throw error;
    }
  }

  /**
   * Verified OTP and moves trip to in_progress status
   */
  static async verifyOTP(tripId, otp) {
    try {
      const result = await query(
        `UPDATE trips 
         SET otp_verified = true, 
             otp_verified_at = NOW(), 
             status = 'in_progress',
             updated_at = NOW()
         WHERE id = $1 AND otp_code = $2
         RETURNING *`,
        [tripId, otp]
      );

      if (result.rows.length === 0) {
        throw new Error('Invalid OTP or trip not found');
      }

      logger.info('OTP verified and trip started', { tripId });
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

  static async getClientDashboardStats(clientId) {
    try {
      const result = await query(
        `SELECT 
          COUNT(*) as total_rides,
          COALESCE(SUM(COALESCE(actual_distance, estimated_distance)), 0) as total_distance
         FROM trips 
         WHERE client_id = $1 AND status = 'completed'`,
        [clientId]
      );
      
      const stats = result.rows[0];
      return {
        totalRides: parseInt(stats.total_rides) || 0,
        totalDistance: parseFloat(stats.total_distance) || 0
      };
    } catch (error) {
      logger.error('Error fetching client dashboard stats:', error);
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

  static async findActiveByDriverId(driverId) {
    try {
      const result = await query(
        `SELECT t.*, 
                u.full_name as client_name, u.phone as client_phone
         FROM trips t
         JOIN users u ON t.client_id = u.id
         WHERE t.driver_id = $1 
         AND t.status IN ('accepted', 'in_progress', 'waiting_for_pickup')
         ORDER BY t.created_at DESC
         LIMIT 1`,
        [driverId]
      );
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error finding active driver trip:', error);
      throw error;
    }
  }

  static async generateOTP(tripId) {
    try {
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      
      await query(
        `UPDATE trips SET otp_code = $1, updated_at = NOW() WHERE id = $2`,
        [otp, tripId]
      );

      logger.debug('OTP generated', { tripId, otp });
      return otp;
    } catch (error) {
      logger.error('Error generating OTP:', error);
      throw error;
    }
  }

  static async createReport(tripId, reportedBy, type, description, images = []) {
    try {
      const result = await query(
        `INSERT INTO trip_reports (trip_id, reported_by, type, description, images, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'open', NOW(), NOW())
         RETURNING *`,
        [tripId, reportedBy, type, description, images]
      );
      logger.info('Trip report created', { tripId, reportId: result.rows[0].id, reportedBy });
      return result.rows[0];
    } catch (error) {
      logger.error('Error creating trip report:', error);
      throw error;
    }
  }

  static async getReports(status = 'all', limit = 50, offset = 0, tripId = null) {
    try {
      let queryText = `SELECT tr.*, t.driver_id, t.client_id, u.full_name as client_name, d.full_name as driver_name
                       FROM trip_reports tr
                       LEFT JOIN trips t ON tr.trip_id = t.id
                       LEFT JOIN users u ON t.client_id = u.id
                       LEFT JOIN users d ON t.driver_id = d.id`;
      const params = [];
      const whereClauses = [];

      if (status !== 'all') {
        params.push(status);
        whereClauses.push(`tr.status = $${params.length}`);
      }
      if (tripId) {
        params.push(tripId);
        whereClauses.push(`t.id = $${params.length}`);
      }

      if (whereClauses.length > 0) {
        queryText += ` WHERE ${whereClauses.join(' AND ')}`;
      }

      params.push(limit, offset);
      queryText += ` ORDER BY tr.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;

      const result = await query(queryText, params);
      return result.rows;
    } catch (error) {
      logger.error('Error fetching trip reports:', error);
      throw error;
    }
  }

  static async getReportById(reportId) {
    try {
      const result = await query(
        `SELECT tr.*, t.driver_id, t.client_id, u.full_name as client_name, d.full_name as driver_name
         FROM trip_reports tr
         LEFT JOIN trips t ON tr.trip_id = t.id
         LEFT JOIN users u ON t.client_id = u.id
         LEFT JOIN users d ON t.driver_id = d.id
         WHERE tr.id = $1`,
        [reportId]
      );
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error finding trip report by id:', error);
      throw error;
    }
  }

  static async updateReportStatus(reportId, status, resolutionNote = null) {
    try {
      const result = await query(
        `UPDATE trip_reports
         SET status = $1,
             resolution_note = $2,
             updated_at = NOW()
         WHERE id = $3
         RETURNING *`,
        [status, resolutionNote, reportId]
      );
      logger.info('Trip report status updated', { reportId, status });
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error updating trip report status:', error);
      throw error;
    }
  }
}

module.exports = Trip;