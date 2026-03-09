/**
 * Driver Model
 * Handles driver-specific data and operations
 */

const { query, transaction } = require("../config/database");
const logger = require("../utils/logger");

class Driver {
  static async create(driverId, driverData) {
    const {
      nationalId,
      drivingLicense,
      licenseExpiry,
      profilePhoto,
      region,
      vehicleInfo,
    } = driverData;

    return transaction(async (client) => {
      try {
        const result = await client.query(
          `INSERT INTO drivers (
            user_id, national_id, driving_license, license_expiry, 
            profile_photo, region, vehicle_info, verification_status, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
          RETURNING *`,
          [
            driverId,
            nationalId,
            drivingLicense,
            licenseExpiry,
            profilePhoto,
            region,
            JSON.stringify(vehicleInfo),
            "pending",
          ],
        );

        logger.info("Driver profile created", { driverId, status: "pending" });
        return result.rows[0];
      } catch (error) {
        logger.error("Error creating driver profile:", error);
        throw error;
      }
    });
  }

  static async getDashboardStats(driverId) {
    try {
      const result = await query(
        `
      SELECT 
        -- Current rating from driver profile
        (SELECT COALESCE(rating, 0) FROM drivers WHERE user_id = $1) as rating,
        
        -- Lifetime stats
        (SELECT COUNT(*) FROM trips WHERE driver_id = $1 AND status = 'completed') as total_trips,
        (SELECT COALESCE(SUM(driver_earnings), 0) FROM trips WHERE driver_id = $1 AND status = 'completed') as total_earnings,
        
        -- Weekly trend (last 7 days)
        (SELECT COUNT(*) FROM trips 
         WHERE driver_id = $1 
         AND status = 'completed' 
         AND created_at >= NOW() - INTERVAL '7 days') as trips_this_week,
         
        -- Earnings trend (percentage change comparison could be done in JS, but let's get the value)
        (SELECT COALESCE(SUM(driver_earnings), 0) FROM trips 
         WHERE driver_id = $1 
         AND status = 'completed' 
         AND created_at >= NOW() - INTERVAL '7 days') as earnings_this_week
    `,
        [driverId],
      );

      return result.rows[0];
    } catch (error) {
      logger.error("Error fetching driver dashboard stats:", error);
      throw error;
    }
  }

  static async findById(driverId) {
    try {
      const result = await query(
        `SELECT d.*, u.phone, u.full_name, u.email, u.language, u.status
         FROM drivers d
         JOIN users u ON d.user_id = u.id
         WHERE d.user_id = $1`,
        [driverId],
      );
      return result.rows[0] || null;
    } catch (error) {
      logger.error("Error finding driver:", error);
      throw error;
    }
  }

  static async getApprovedDriversByRegion(region, limit = 10, offset = 0) {
    try {
      const result = await query(
        `SELECT d.*, u.phone, u.full_name, u.email
         FROM drivers d
         JOIN users u ON d.user_id = u.id
         WHERE d.region = $1 AND d.verification_status = 'approved' AND u.status = 'active'
         ORDER BY d.rating DESC
         LIMIT $2 OFFSET $3`,
        [region, limit, offset],
      );
      return result.rows;
    } catch (error) {
      logger.error("Error fetching approved drivers:", error);
      throw error;
    }
  }

  static async getNearestDrivers(
    longitude,
    latitude,
    region,
    maxDistanceKm = 5,
  ) {
    try {
      console.log(
        `🔍 Dispatching: Searching near [Lat: ${latitude}, Lng: ${longitude}]`,
      );

      const sql = `
      WITH driver_distances AS (
        SELECT 
          d.user_id, 
          u.full_name, 
          d.rating, 
          d.current_latitude, 
          d.current_longitude,
          ( 6371 * acos( 
              cos( radians($1) ) * cos( radians( CAST(d.current_latitude AS FLOAT) ) ) 
              * cos( radians( CAST(d.current_longitude AS FLOAT) ) - radians($2) ) 
              + sin( radians($1) ) * sin( radians( CAST(d.current_latitude AS FLOAT) ) ) 
            ) 
          ) AS distance
        FROM drivers d
        JOIN users u ON d.user_id = u.id
        WHERE d.is_online = true
        -- AND d.verification_status = 'approved' -- Keep commented for testing
      )
      SELECT * FROM driver_distances
      WHERE distance <= $3
      ORDER BY distance ASC;
    `;

      const result = await query(sql, [latitude, longitude, maxDistanceKm]);

      console.log(
        `✅ Dispatch Result: ${result.rows.length} driver(s) found within ${maxDistanceKm}km`,
      );

      // Log the found driver IDs for debugging
      if (result.rows.length > 0) {
        console.log("IDs found:", result.rows.map((r) => r.user_id).join(", "));
      }

      return result.rows;
    } catch (error) {
      console.error("CRITICAL ERROR in getNearestDrivers:", error);
      throw error;
    }
  }

  static async updateVerificationStatus(driverId, status) {
    try {
      const result = await query(
        `UPDATE drivers 
       SET verification_status = $1, updated_at = NOW()
       WHERE id = $2 
       RETURNING *`,
        [status, driverId],
      );

      logger.info("Driver verification status updated", { driverId, status });
      return result.rows[0] || null;
    } catch (error) {
      logger.error("Error updating verification status:", error);
      throw error;
    }
  }

  static async updateLocation(driverId, latitude, longitude) {
    try {
      const result = await query(
        // Changed to $1, $2, $3 to perfectly match the array below
        `UPDATE drivers SET current_latitude = $1, current_longitude = $2, 
         last_location_update = NOW(), updated_at = NOW()
         WHERE user_id = $3
         RETURNING user_id, current_latitude, current_longitude`,
        // Reordered the array so $1=latitude, $2=longitude, $3=driverId
        [latitude, longitude, driverId],
      );
      return result.rows[0] || null;
    } catch (error) {
      logger.error("Error updating driver location:", error);
      throw error;
    }
  }

  static async setOnlineStatus(driverId, isOnline) {
    try {
      const result = await query(
        `UPDATE drivers SET is_online = $1, updated_at = NOW()
         WHERE user_id = $2
         RETURNING user_id, is_online`,
        [isOnline, driverId],
      );
      logger.info("Driver online status updated", { driverId, isOnline });
      return result.rows[0] || null;
    } catch (error) {
      logger.error("Error updating online status:", error);
      throw error;
    }
  }
  static async updateRating(driverId, rating, review, tripId, clientId) {
    return transaction(async (client) => {
      // 1. Insert into trip_ratings table correctly
      await client.query(
        `INSERT INTO trip_ratings (trip_id, rater_id, rating, review, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
        [tripId, clientId, rating, review], // Use clientId here
      );

      // 2. Update the driver's aggregate rating
      await client.query(
        `UPDATE drivers 
       SET rating = (
         SELECT AVG(rating)::DECIMAL(3,2) 
         FROM trip_ratings 
         WHERE trip_id IN (SELECT id FROM trips WHERE driver_id = $1)
       ),
       total_trips = total_trips + 1
       WHERE user_id = $1`,
        [driverId],
      );
    });
  }
  static async getEarnings(driverId, startDate, endDate) {
    try {
      // 1. Get Summary Stats
      const summaryResult = await query(
        `SELECT 
        COUNT(*)::int as "tripCount",
        COALESCE(SUM(driver_earnings), 0)::float as "totalEarnings",
        COALESCE(AVG(driver_earnings), 0)::float as "averagePerTrip"
       FROM trips
       WHERE driver_id = $1 AND status = 'completed' 
       AND created_at BETWEEN $2 AND $3`,
        [driverId, startDate, endDate],
      );

      // 2. Get Weekly Breakdown (Groups by week start date)
      const weeklyResult = await query(
        `SELECT SUM(driver_earnings)::float as amount
       FROM trips
       WHERE driver_id = $1 AND status = 'completed'
       AND created_at BETWEEN $2 AND $3
       GROUP BY DATE_TRUNC('week', created_at)
       ORDER BY DATE_TRUNC('week', created_at) ASC`,
        [driverId, startDate, endDate],
      );

      const summary = summaryResult.rows[0];
      return {
        ...summary,
        weeklyEarnings: weeklyResult.rows.map((row) => row.amount),
      };
    } catch (error) {
      logger.error("Error fetching driver earnings:", error);
      throw error;
    }
  }

  static async suspend(driverId, reason) {
    return transaction(async (client) => {
      try {
        // Suspend driver
        await client.query(
          `UPDATE drivers SET verification_status = 'suspended', updated_at = NOW()
           WHERE user_id = $1`,
          [driverId],
        );

        // Log suspension reason
        await client.query(
          `INSERT INTO driver_suspensions (driver_id, reason, created_at)
           VALUES ($1, $2, NOW())`,
          [driverId, reason],
        );

        logger.info("Driver suspended", { driverId, reason });
        return true;
      } catch (error) {
        logger.error("Error suspending driver:", error);
        throw error;
      }
    });
  }
}

module.exports = Driver;
