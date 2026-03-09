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


  static async getActiveTrips(limit = 20, offset = 0, status = 'all') {
    try {
      let statusFilter = '';
      const queryParams = [limit, offset];
      
      // Securely parameterize the status if it's not 'all'
      if (status !== 'all') {
        statusFilter = `AND t.status = $3`;
        queryParams.push(status);
      }

      // 1. Get Trips
      const result = await query(
        `
        SELECT 
          t.id, t.client_id, t.driver_id, t.status, t.booking_type,
          t.pickup_address, t.dropoff_address, t.distance, t.duration,
          t.total_price, t.base_fare, t.distance_charge, t.surcharge,
          t.created_at, t.assigned_at, t.started_at, t.completed_at, t.cancelled_at,
          
          c.full_name as client_name, c.phone as client_phone, c.email as client_email, c.rating as client_rating,
          
          d.full_name as driver_name, d.phone as driver_phone, d.email as driver_email, d.rating as driver_rating, d.is_online as driver_is_online,
          
          car.model as car_model, car.license_plate, car.color as car_color
        
        FROM trips t
        LEFT JOIN users c ON t.client_id = c.id AND c.role = 'client'
        LEFT JOIN users d ON t.driver_id = d.id AND d.role = 'driver'
        LEFT JOIN cars car ON d.id = car.driver_id
        
        WHERE t.status IN ('scheduled', 'assigned', 'started')
        ${statusFilter}
        
        ORDER BY t.created_at DESC
        LIMIT $1 OFFSET $2
        `,
        queryParams
      );

      // 2. Get Count for Pagination
      const countParams = status !== 'all' ? [status] : [];
      const countResult = await query(
        `
        SELECT COUNT(*) as total
        FROM trips t
        WHERE t.status IN ('scheduled', 'assigned', 'started')
        ${status !== 'all' ? 'AND t.status = $1' : ''}
        `,
        countParams
      );

      return {
        trips: result.rows,
        total: parseInt(countResult.rows[0].total)
      };
    } catch (error) {
      logger.error('Error fetching active trips:', error);
      throw error;
    }
  }

  /**
   * Get extremely detailed trip view for Admin Dashboard
   */
  static async getAdminTripDetails(tripId) {
    try {
      const result = await query(
        `
        SELECT 
          t.*,
          
          c.full_name as client_name, c.phone as client_phone, c.email as client_email, c.rating as client_rating, c.status as client_status,
          
          d.full_name as driver_name, d.phone as driver_phone, d.email as driver_email, d.rating as driver_rating, d.status as driver_status, d.is_online as driver_is_online, d.total_trips as driver_total_trips, d.total_earnings as driver_total_earnings,
          
          car.model as car_model, car.license_plate, car.color as car_color,
          
          rating.rating as client_rating_given, rating.review as client_review, rating.created_at as rating_date
        
        FROM trips t
        LEFT JOIN users c ON t.client_id = c.id
        LEFT JOIN users d ON t.driver_id = d.id
        LEFT JOIN cars car ON d.id = car.driver_id
        LEFT JOIN ratings rating ON t.id = rating.trip_id
        
        WHERE t.id = $1
        `,
        [tripId]
      );
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error fetching admin trip details:', error);
      throw error;
    }
  }

  /**
   * Get 24-hour Trip Statistics for Admin Dashboard
   */
  static async getDashboardStatistics() {
    try {
      const stats = await query(
        `
        SELECT 
          COUNT(CASE WHEN status = 'scheduled' THEN 1 END) as scheduled_count,
          COUNT(CASE WHEN status = 'assigned' THEN 1 END) as assigned_count,
          COUNT(CASE WHEN status = 'started' THEN 1 END) as started_count,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_count,
          COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_count,
          
          COUNT(CASE WHEN status IN ('scheduled', 'assigned', 'started') THEN 1 END) as active_trips,
          
          SUM(CASE WHEN status = 'completed' THEN total_price ELSE 0 END) as total_revenue,
          AVG(CASE WHEN status = 'completed' THEN total_price ELSE NULL END) as avg_fare,
          
          SUM(CASE WHEN status = 'completed' THEN distance ELSE 0 END) as total_distance,
          AVG(CASE WHEN status = 'completed' THEN distance ELSE NULL END) as avg_distance,
          
          AVG(CASE WHEN status = 'completed' THEN duration ELSE NULL END) as avg_duration,
          
          COUNT(*) as total_trips
        
        FROM trips
        WHERE created_at >= NOW() - INTERVAL '24 hours'
        `
      );
      return stats.rows[0];
    } catch (error) {
      logger.error('Error fetching dashboard statistics:', error);
      throw error;
    }
  }



 
}

module.exports = Trip;