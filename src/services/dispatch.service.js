/**
 * Dispatch Service
 * Handles driver assignment and booking logic
 */

const Driver = require('../models/Driver');
const Trip = require('../models/Trip');
const { query } = require('../config/database');
const logger = require('../utils/logger');

const ACCEPT_TIMEOUT = 60000; // 60 seconds
const MAX_ASSIGNMENT_ATTEMPTS = 3;

class DispatchService {
  static async findAndAssignDriver(tripData) {
    const {
      tripId,
      pickupLat,
      pickupLng,
      region,
      maxDistance = 5 // km
    } = tripData;

    try {
      // Get available drivers near the pickup location
      const availableDrivers = await Driver.getNearestDrivers(
        pickupLng,
        pickupLat,
        region,
        maxDistance
      );

      if (availableDrivers.length === 0) {
        logger.warn('No drivers available', { tripId, region });
        return {
          success: false,
          message: 'No drivers available in your area'
        };
      }

      // Attempt to assign to nearest driver first
      for (let i = 0; i < Math.min(availableDrivers.length, MAX_ASSIGNMENT_ATTEMPTS); i++) {
        const driver = availableDrivers[i];
        const assigned = await this.sendAssignmentRequest(tripId, driver.user_id);
        
        if (assigned) {
          return {
            success: true,
            message: 'Driver assigned successfully',
            driverId: driver.user_id,
            driverName: driver.full_name,
            driverRating: driver.rating,
            distance: driver.distance
          };
        }
      }

      // If no driver accepted within timeout
      logger.warn('No driver accepted assignment', { tripId });
      return {
        success: false,
        message: 'Unable to find available driver. Please try again.'
      };

    } catch (error) {
      logger.error('Error in dispatch service:', error);
      throw error;
    }
  }

  static async sendAssignmentRequest(tripId, driverId) {
    try {
      // Create booking request
      const result = await query(
        `INSERT INTO booking_requests (trip_id, driver_id, status, expires_at, created_at)
         VALUES ($1, $2, $3, NOW() + INTERVAL '1 minute', NOW())
         RETURNING *`,
        [tripId, driverId, 'pending']
      );

      const request = result.rows[0];
      logger.debug('Booking request sent', { tripId, driverId, requestId: request.id });

      // TODO: Send push notification to driver
      // await NotificationService.notifyDriver(driverId, {
      //   type: 'booking_request',
      //   tripId,
      //   expiresAt: request.expires_at
      // });

      // Wait for driver response (with timeout)
      const accepted = await this.waitForDriverResponse(request.id, ACCEPT_TIMEOUT);
      return accepted;

    } catch (error) {
      logger.error('Error sending assignment request:', error);
      return false;
    }
  }

  static async waitForDriverResponse(requestId, timeout) {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const checkInterval = setInterval(async () => {
        try {
          const result = await query(
            'SELECT status FROM booking_requests WHERE id = $1',
            [requestId]
          );

          if (result.rows.length === 0) {
            clearInterval(checkInterval);
            resolve(false);
            return;
          }

          const request = result.rows[0];

          if (request.status === 'accepted') {
            clearInterval(checkInterval);
            resolve(true);
            return;
          }

          if (request.status === 'rejected') {
            clearInterval(checkInterval);
            resolve(false);
            return;
          }

          if (Date.now() - startTime > timeout) {
            // Mark as expired
            await query(
              'UPDATE booking_requests SET status = $1 WHERE id = $2',
              ['expired', requestId]
            );
            clearInterval(checkInterval);
            resolve(false);
            return;
          }
        } catch (error) {
          logger.error('Error checking driver response:', error);
        }
      }, 1000); // Check every second
    });
  }

  static async acceptBooking(requestId, driverId) {
    try {
      const result = await query(
        `UPDATE booking_requests 
         SET status = $1, accepted_at = NOW()
         WHERE id = $2 AND driver_id = $3
         RETURNING *`,
        ['accepted', requestId, driverId]
      );

      if (result.rows.length === 0) {
        throw new Error('Booking request not found or invalid driver');
      }

      const request = result.rows[0];

      // Update trip status to 'accepted'
      await query(
        'UPDATE trips SET driver_id = $1, status = $2, updated_at = NOW() WHERE id = $3',
        [driverId, 'accepted', request.trip_id]
      );

      logger.info('Booking accepted', { requestId, driverId, tripId: request.trip_id });
      return request;

    } catch (error) {
      logger.error('Error accepting booking:', error);
      throw error;
    }
  }

  static async rejectBooking(requestId, driverId, reason) {
    try {
      const result = await query(
        `UPDATE booking_requests 
         SET status = $1, rejection_reason = $2, rejected_at = NOW()
         WHERE id = $3 AND driver_id = $4
         RETURNING *`,
        ['rejected', reason, requestId, driverId]
      );

      if (result.rows.length === 0) {
        throw new Error('Booking request not found');
      }

      logger.info('Booking rejected', { requestId, driverId, reason });
      return result.rows[0];

    } catch (error) {
      logger.error('Error rejecting booking:', error);
      throw error;
    }
  }

  static async getPendingRequests(driverId) {
    try {
      const result = await query(
        `SELECT br.*, t.pickup_address, t.destination_address, t.total_price,
                t.pickup_latitude, t.pickup_longitude, t.estimated_distance, 
                t.estimated_duration
         FROM booking_requests br
         JOIN trips t ON br.trip_id = t.id
         WHERE br.driver_id = $1 AND br.status = 'pending' AND br.expires_at > NOW()
         ORDER BY br.created_at DESC`,
        [driverId]
      );
      return result.rows;
    } catch (error) {
      logger.error('Error fetching pending requests:', error);
      throw error;
    }
  }
}

module.exports = DispatchService;