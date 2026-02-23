/**
 * Pricing Service
 * Handles fare calculation, discounts, and commission logic
 */

const { query } = require('../config/database');
const logger = require('../utils/logger');

class PricingService {
  static async getPricingConfig() {
    try {
      const result = await query(
        `SELECT * FROM pricing_config WHERE is_active = true LIMIT 1`
      );
      return result.rows[0] || this.getDefaultConfig();
    } catch (error) {
      logger.error('Error fetching pricing config:', error);
      return this.getDefaultConfig();
    }
  }

  // 1. Create a new pricing config and make it the active one
 // pricing.service.js
  static async createPricingConfig(config) {
    try {
      const result = await query(
        `WITH deactivate_all AS (
           UPDATE pricing_config SET is_active = false RETURNING id
         )
         INSERT INTO pricing_config (
           commission_percentage, 
           base_fare, 
           per_km_rate, 
           minimum_fare,
           night_surcharge_percentage, 
           long_distance_coefficient,
           hourly_rates, -- ADDED THIS
           is_active
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, true) -- ADDED $7
         RETURNING *`,
        [
          config.commission_percentage || 25,
          config.base_fare || 3000,
          config.per_km_rate || 300,
          config.minimum_fare || 5000,
          config.night_surcharge_percentage || 15,
          config.long_distance_coefficient || 1.1,
          config.hourly_rates || '{"1": 5000, "4": 18000, "8": 35000}' // ADDED THIS
        ]
      );

      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }

  // 2. View all past and present pricing configs
  static async getPricingHistory() {
    try {
      const result = await query(
        `SELECT * FROM pricing_config ORDER BY created_at DESC`
      );
      return result.rows;
    } catch (error) {
      logger.error('Error fetching pricing history:', error);
      throw error;
    }
  }

  // 3. Activate a specific historical pricing config
  static async activatePricingConfig(id) {
    try {
      // Deactivate all, then activate only the specified ID
      const result = await query(
        `WITH deactivate_all AS (
           UPDATE pricing_config SET is_active = false RETURNING id
         )
         UPDATE pricing_config 
         SET is_active = true, updated_at = NOW() 
         WHERE id = $1 
         RETURNING *`,
        [id]
      );

      if (result.rows.length === 0) {
        throw new Error('Pricing configuration not found');
      }

      logger.info(`Pricing config ID ${id} activated`);
      return result.rows[0];
    } catch (error) {
      logger.error('Error activating pricing config:', error);
      throw error;
    }
  }

  static getDefaultConfig() {
    return {
      commission_percentage: 25,
      base_fare: 3000,
      per_km_rate: 300,
      minimum_fare: 5000,
      hourly_rates: {
        1: 5000,
        4: 18000,
        8: 35000
      },
      night_surcharge_percentage: 15,
      night_start_hour: 22,
      night_end_hour: 6,
      long_distance_coefficient: 1.1,
      long_distance_threshold_km: 50
    };
  }

  static async calculatePointToPointFare(distance, pickupTime, isNightTrip = false) {
    try {
      const config = await this.getPricingConfig();
      
      // Base calculation
      let fare = config.base_fare + (distance * config.per_km_rate);

      // Apply minimum fare
      fare = Math.max(fare, config.minimum_fare);

      // Apply long-distance coefficient
      if (distance > config.long_distance_threshold_km) {
        fare *= config.long_distance_coefficient;
      }

      // Apply night surcharge
      if (isNightTrip) {
        fare *= (1 + config.night_surcharge_percentage / 100);
      }

      return {
        baseFare: config.base_fare + (distance * config.per_km_rate),
        distance,
        surcharges: {
          nightSurcharge: isNightTrip ? (fare * config.night_surcharge_percentage / 100) : 0,
          longDistanceMultiplier: distance > config.long_distance_threshold_km 
            ? config.long_distance_coefficient 
            : 1
        },
        totalFare: Math.round(fare),
        currency: 'XOF'
      };
    } catch (error) {
      logger.error('Error calculating point-to-point fare:', error);
      throw error;
    }
  }

  static async calculateHourlyFare(hours, isNightTrip = false) {
    try {
      const config = await this.getPricingConfig();
      const hourlyRates = config.hourly_rates;

      let fare = 0;

      // Find applicable hourly rate
      if (hours >= 8) {
        fare = hourlyRates[8] * (hours / 8);
      } else if (hours >= 4) {
        fare = hourlyRates[4] * (hours / 4);
      } else if (hours >= 1) {
        fare = hourlyRates[1] * hours;
      } else {
        // Less than 1 hour, use 1-hour rate
        fare = hourlyRates[1];
      }

      // Apply night surcharge
      if (isNightTrip) {
        fare *= (1 + config.night_surcharge_percentage / 100);
      }

      return {
        baseRate: this.getApplicableHourlyRate(hours, hourlyRates),
        hours,
        surcharges: {
          nightSurcharge: isNightTrip ? (fare * config.night_surcharge_percentage / 100) : 0
        },
        totalFare: Math.round(fare),
        currency: 'XOF'
      };
    } catch (error) {
      logger.error('Error calculating hourly fare:', error);
      throw error;
    }
  }

  static getApplicableHourlyRate(hours, rates) {
    if (hours >= 8) return rates[8];
    if (hours >= 4) return rates[4];
    return rates[1];
  }

  static async calculateCommission(totalFare) {
    try {
      const config = await this.getPricingConfig();
      const commissionPercentage = config.commission_percentage;
      const commission = (totalFare * commissionPercentage) / 100;
      const driverEarnings = totalFare - commission;

      return {
        totalFare: Math.round(totalFare),
        commissionPercentage,
        platformCommission: Math.round(commission),
        driverEarnings: Math.round(driverEarnings),
        currency: 'XOF'
      };
    } catch (error) {
      logger.error('Error calculating commission:', error);
      throw error;
    }
  }

  static isNightTrip(time) {
    const hour = new Date(time).getHours();
    return hour >= 22 || hour < 6;
  }

  static async updatePricingConfig(config) {
    try {
      const result = await query(
        `UPDATE pricing_config 
         SET commission_percentage = $1,
             base_fare = $2,
             per_km_rate = $3,
             minimum_fare = $4,
             night_surcharge_percentage = $5,
             long_distance_coefficient = $6,
             updated_at = NOW()
         WHERE is_active = true
         RETURNING *`,
        [
          config.commission_percentage,
          config.base_fare,
          config.per_km_rate,
          config.minimum_fare,
          config.night_surcharge_percentage,
          config.long_distance_coefficient
        ]
      );

      logger.info('Pricing config updated');
      return result.rows[0];
    } catch (error) {
      logger.error('Error updating pricing config:', error);
      throw error;
    }
  }
}

module.exports = PricingService;