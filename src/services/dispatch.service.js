/**
 * Dispatch Service
 * Handles driver assignment and booking logic
 */

const Driver = require("../models/Driver");
const Trip = require("../models/Trip");
const { query } = require("../config/database");
const logger = require("../utils/logger");
const { notifyDriver } = require("./socket.service"); // Ensure this is imported correctly

const ACCEPT_TIMEOUT = 300000; // 5 minutes in milliseconds
const MAX_ASSIGNMENT_ATTEMPTS = 3;

class DispatchService {
  static async findAndAssignDriver(tripData) {
    const {
      tripId,
      pickupLat,
      pickupLng,
      region,
      maxDistance = 1550, // km
    } = tripData;

    try {
      // 1. Log the start of the search
      console.log(`🔍 [Dispatch] Searching for drivers near ${pickupLat}, ${pickupLng} (Trip: ${tripId})`);

      // Get available drivers near the pickup location
      const availableDrivers = await Driver.getNearestDrivers(
        pickupLng,
        pickupLat,
        region,
        maxDistance,
      );

      if (availableDrivers.length === 0) {
        logger.warn("No drivers available", { tripId, region });
        return {
          success: false,
          message: "No drivers available in your area",
        };
      }

      console.log(`✅ [Dispatch] Found ${availableDrivers.length} drivers nearby for Trip ${tripId}`);

      // Attempt to assign to nearest driver first
      for (
        let i = 0;
        i < Math.min(availableDrivers.length, MAX_ASSIGNMENT_ATTEMPTS);
        i++
      ) {
        const driver = availableDrivers[i];
        console.log(`📤 [Dispatch] Sending request to Driver ID: ${driver.user_id}`);
        
        const assigned = await this.sendAssignmentRequest(
          tripId,
          driver.user_id,
        );

        if (assigned) {
          return {
            success: true,
            message: "Driver assigned successfully",
            driverId: driver.user_id,
            driverName: driver.full_name,
            driverRating: driver.rating,
            distance: driver.distance,
          };
        }
      }

      // If no driver accepted within timeout
      logger.warn("No driver accepted assignment", { tripId });
      return {
        success: false,
        message: "Unable to find available driver. Please try again.",
      };
    } catch (error) {
      logger.error("Error in dispatch service:", error);
      throw error;
    }
  }

  static async sendAssignmentRequest(tripId, driverId) {
    try {
      // Create booking request using Database UTC time to avoid local time mismatches
      const result = await query(
        `INSERT INTO booking_requests (trip_id, driver_id, status, expires_at, created_at)
         VALUES ($1, $2, 'pending', (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + INTERVAL '5 minutes', (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'))
         RETURNING *`,
        [tripId, driverId],
      );

      const request = result.rows[0];
      
      logger.debug("Booking request sent", {
        tripId,
        driverId,
        requestId: request.id,
      });

      // REAL-TIME NOTIFICATION via Socket
      notifyDriver(driverId, 'new_booking_request', {
        requestId: request.id,
        tripId: tripId,
        expiresAt: request.expires_at
      });

      // Wait for driver response (with timeout)
      const accepted = await this.waitForDriverResponse(
        request.id,
        ACCEPT_TIMEOUT,
      );
      return accepted;
    } catch (error) {
      logger.error("Error sending assignment request:", error);
      return false;
    }
  }

  static async waitForDriverResponse(requestId, timeout) {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const checkInterval = setInterval(async () => {
        try {
          const result = await query(
            "SELECT status FROM booking_requests WHERE id = $1",
            [requestId],
          );

          if (result.rows.length === 0) {
            clearInterval(checkInterval);
            resolve(false);
            return;
          }

          const request = result.rows[0];

          if (request.status === "accepted") {
            clearInterval(checkInterval);
            resolve(true);
            return;
          }

          if (request.status === "rejected") {
            clearInterval(checkInterval);
            resolve(false);
            return;
          }

          if (Date.now() - startTime > timeout) {
            // Mark as expired
            await query(
              "UPDATE booking_requests SET status = $1 WHERE id = $2",
              ["expired", requestId],
            );
            clearInterval(checkInterval);
            resolve(false);
            return;
          }
        } catch (error) {
          logger.error("Error checking driver response:", error);
        }
      }, 2000); // Check every 2 seconds to reduce DB load
    });
  }

 static async acceptBooking(requestId, driverId) {
    try {
      const result = await query(
        `UPDATE booking_requests 
         SET status = $1, accepted_at = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
         WHERE id = $2 AND driver_id = $3
         RETURNING *`,
        ["accepted", requestId, driverId],
      );

      if (result.rows.length === 0) {
        throw new Error("Booking request not found or invalid driver");
      }

      const request = result.rows[0];

      // 🟢 CHANGE THIS: Change 'assigned' to 'accepted' 
      // to match your database check constraint
      await query(
        "UPDATE trips SET driver_id = $1, status = $2, updated_at = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') WHERE id = $3",
        [driverId, "accepted", request.trip_id], 
      );

      logger.info("Booking accepted", {
        requestId,
        driverId,
        tripId: request.trip_id,
      });
      return request;
    } catch (error) {
      logger.error("Error accepting booking:", error);
      throw error;
    }
  }
  static async rejectBooking(requestId, driverId, reason) {
    try {
      const result = await query(
        `UPDATE booking_requests 
         SET status = $1, rejection_reason = $2, rejected_at = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
         WHERE id = $3 AND driver_id = $4
         RETURNING *`,
        ["rejected", reason, requestId, driverId],
      );

      if (result.rows.length === 0) {
        throw new Error("Booking request not found");
      }

      logger.info("Booking rejected", { requestId, driverId, reason });
      return result.rows[0];
    } catch (error) {
      logger.error("Error rejecting booking:", error);
      throw error;
    }
  }

  static async getPendingRequests(driverId) {
    try {
      const result = await query(
        `SELECT br.id as request_id, br.status as request_status, br.expires_at,
                t.pickup_address, t.destination_address, t.total_price,
                t.pickup_latitude, t.pickup_longitude, t.estimated_distance, 
                t.estimated_duration
         FROM booking_requests br
         JOIN trips t ON br.trip_id = t.id
         WHERE br.driver_id = $1 
           AND br.status = 'pending' 
           AND br.expires_at > (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
         ORDER BY br.created_at DESC
         LIMIT 1`,
        [driverId],
      );
      return result.rows;
    } catch (error) {
      logger.error("Error fetching pending requests:", error);
      throw error;
    }
  }

 static async getRequestById(requestId, driverId) {
  try {
    const result = await query(
      `SELECT 
          br.id as request_id, 
          br.status as request_status, 
          br.expires_at,
          t.id as trip_id,
          t.pickup_address, 
          t.destination_address, 
          t.total_price,
          t.estimated_distance,
          t.estimated_duration,
          u.full_name as client_name,
          u.phone as client_phone, -- Fixed: changed u.phone_number to u.phone
          u.id as client_id,
          -- Subquery to count previous successful trips for this user
          (SELECT COUNT(*) FROM trips WHERE client_id = u.id AND status = 'completed') as client_total_rides
       FROM booking_requests br
       JOIN trips t ON br.trip_id = t.id
       JOIN users u ON t.client_id = u.id
       WHERE br.id = $1 AND br.driver_id = $2`,
      [requestId, driverId]
    );
    return result.rows[0];
  } catch (error) {
    logger.error("Error fetching request details:", error);
    throw error;
  }
}
}

module.exports = DispatchService;