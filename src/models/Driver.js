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

  static async getNearestDrivers(latitude, longitude, region, maxDistance = 5) {
    try {
      const result = await query(
        `SELECT d.*, u.phone, u.full_name,
                (6371 * acos(cos(radians($2)) * cos(radians(d.current_latitude)) * 
                 cos(radians(d.current_longitude) - radians($1)) + 
                 sin(radians($2)) * sin(radians(d.current_latitude)))) AS distance
         FROM drivers d
         JOIN users u ON d.user_id = u.id
         WHERE d.region = $3 AND d.verification_status = 'approved' AND d.is_online = true 
         AND u.status = 'active'
         HAVING (6371 * acos(cos(radians($2)) * cos(radians(d.current_latitude)) * 
                 cos(radians(d.current_longitude) - radians($1)) + 
                 sin(radians($2)) * sin(radians(d.current_latitude)))) <= $4
         ORDER BY distance ASC`,
        [longitude, latitude, region, maxDistance],
      );
      return result.rows;
    } catch (error) {
      logger.error("Error fetching nearest drivers:", error);
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
        `UPDATE drivers SET current_latitude = $1, current_longitude = $2, 
         last_location_update = NOW(), updated_at = NOW()
         WHERE user_id = $1
         RETURNING user_id, current_latitude, current_longitude`,
        [driverId, latitude, longitude],
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

  static async updateRating(driverId, newRating) {
    try {
      const result = await query(
        `UPDATE drivers SET rating = $1, updated_at = NOW()
         WHERE user_id = $2
         RETURNING user_id, rating`,
        [newRating, driverId],
      );
      return result.rows[0] || null;
    } catch (error) {
      logger.error("Error updating driver rating:", error);
      throw error;
    }
  }

  static async getEarnings(driverId, startDate, endDate) {
    try {
      const result = await query(
        `SELECT 
          COUNT(*) as total_trips,
          SUM(driver_earnings) as total_earnings,
          AVG(driver_earnings) as avg_earning_per_trip,
          SUM(platform_commission) as total_commission_paid
         FROM trips
         WHERE driver_id = $1 AND status = 'completed' 
         AND created_at BETWEEN $2 AND $3`,
        [driverId, startDate, endDate],
      );
      return (
        result.rows[0] || {
          total_trips: 0,
          total_earnings: 0,
          avg_earning_per_trip: 0,
          total_commission_paid: 0,
        }
      );
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
