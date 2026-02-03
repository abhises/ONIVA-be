-- ONIVA Database Schema
-- PostgreSQL

-- Users Table
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  phone VARCHAR(20) UNIQUE NOT NULL,
  email VARCHAR(255),
  full_name VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL CHECK (role IN ('client', 'driver', 'admin')),
  language VARCHAR(10) DEFAULT 'en',
  status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_phone ON users(phone);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_status ON users(status);

-- Drivers Table
CREATE TABLE drivers (
  id SERIAL PRIMARY KEY,
  user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  national_id VARCHAR(50) NOT NULL,
  driving_license VARCHAR(50) NOT NULL,
  license_expiry DATE NOT NULL,
  profile_photo TEXT,
  region VARCHAR(100) NOT NULL,
  vehicle_info JSONB,
  verification_status VARCHAR(50) DEFAULT 'pending' CHECK (verification_status IN ('pending', 'approved', 'rejected', 'suspended')),
  is_online BOOLEAN DEFAULT false,
  rating DECIMAL(3,2) DEFAULT 5.0,
  total_trips INTEGER DEFAULT 0,
  current_latitude DECIMAL(10,8),
  current_longitude DECIMAL(11,8),
  last_location_update TIMESTAMP,
  bank_account JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_drivers_status ON drivers(verification_status);
CREATE INDEX idx_drivers_region ON drivers(region);
CREATE INDEX idx_drivers_is_online ON drivers(is_online);
CREATE INDEX idx_drivers_location ON drivers(current_latitude, current_longitude);

-- Trips Table
CREATE TABLE trips (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  driver_id INTEGER REFERENCES drivers(user_id) ON DELETE SET NULL,
  booking_type VARCHAR(50) NOT NULL CHECK (booking_type IN ('point-to-point', 'hourly')),
  pickup_latitude DECIMAL(10,8) NOT NULL,
  pickup_longitude DECIMAL(11,8) NOT NULL,
  pickup_address TEXT,
  destination_latitude DECIMAL(10,8),
  destination_longitude DECIMAL(11,8),
  destination_address TEXT,
  scheduled_time TIMESTAMP NOT NULL,
  estimated_duration INTEGER,
  estimated_distance DECIMAL(10,2),
  actual_duration INTEGER,
  actual_distance DECIMAL(10,2),
  base_price INTEGER NOT NULL,
  total_price INTEGER NOT NULL,
  final_price INTEGER,
  platform_commission INTEGER NOT NULL,
  driver_earnings INTEGER NOT NULL,
  payment_method VARCHAR(50) NOT NULL CHECK (payment_method IN ('cash', 'mobile_money')),
  region VARCHAR(100) NOT NULL,
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'waiting_for_pickup', 'in_progress', 'completed', 'cancelled')),
  otp_code VARCHAR(6),
  otp_verified BOOLEAN DEFAULT false,
  otp_verified_at TIMESTAMP,
  cancellation_reason TEXT,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_trips_client ON trips(client_id);
CREATE INDEX idx_trips_driver ON trips(driver_id);
CREATE INDEX idx_trips_status ON trips(status);
CREATE INDEX idx_trips_region ON trips(region);
CREATE INDEX idx_trips_created ON trips(created_at);

-- Booking Requests Table
CREATE TABLE booking_requests (
  id SERIAL PRIMARY KEY,
  trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  driver_id INTEGER NOT NULL REFERENCES drivers(user_id) ON DELETE CASCADE,
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'expired')),
  rejection_reason TEXT,
  accepted_at TIMESTAMP,
  rejected_at TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_booking_requests_trip ON booking_requests(trip_id);
CREATE INDEX idx_booking_requests_driver ON booking_requests(driver_id);
CREATE INDEX idx_booking_requests_status ON booking_requests(status);

-- Trip Ratings Table
CREATE TABLE trip_ratings (
  id SERIAL PRIMARY KEY,
  trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  rater_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review TEXT,
  category VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_trip_ratings_trip ON trip_ratings(trip_id);
CREATE INDEX idx_trip_ratings_rater ON trip_ratings(rater_id);

-- Trip Reports Table
CREATE TABLE trip_reports (
  id SERIAL PRIMARY KEY,
  trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  reported_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL CHECK (type IN ('safety', 'behavior', 'vehicle', 'route', 'payment', 'other')),
  description TEXT NOT NULL,
  images TEXT[],
  status VARCHAR(50) DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'resolved', 'closed')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP
);

CREATE INDEX idx_trip_reports_trip ON trip_reports(trip_id);
CREATE INDEX idx_trip_reports_status ON trip_reports(status);

-- Driver Suspensions Table
CREATE TABLE driver_suspensions (
  id SERIAL PRIMARY KEY,
  driver_id INTEGER NOT NULL REFERENCES drivers(user_id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  suspended_by INTEGER REFERENCES users(id),
  status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'appealed', 'lifted')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  lifted_at TIMESTAMP
);

CREATE INDEX idx_driver_suspensions_driver ON driver_suspensions(driver_id);

-- Pricing Configuration Table
CREATE TABLE pricing_config (
  id SERIAL PRIMARY KEY,
  commission_percentage DECIMAL(5,2) DEFAULT 25,
  base_fare INTEGER DEFAULT 3000,
  per_km_rate INTEGER DEFAULT 300,
  minimum_fare INTEGER DEFAULT 5000,
  hourly_rates JSONB DEFAULT '{"1": 5000, "4": 18000, "8": 35000}',
  night_surcharge_percentage DECIMAL(5,2) DEFAULT 15,
  night_start_hour INTEGER DEFAULT 22,
  night_end_hour INTEGER DEFAULT 6,
  long_distance_coefficient DECIMAL(3,2) DEFAULT 1.1,
  long_distance_threshold_km INTEGER DEFAULT 50,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Activity Logs Table
CREATE TABLE activity_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(255) NOT NULL,
  resource_type VARCHAR(100),
  resource_id INTEGER,
  details JSONB,
  ip_address VARCHAR(45),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_activity_logs_user ON activity_logs(user_id);
CREATE INDEX idx_activity_logs_created ON activity_logs(created_at);

-- Create function for updating updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_drivers_updated_at BEFORE UPDATE ON drivers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_trips_updated_at BEFORE UPDATE ON trips
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_pricing_config_updated_at BEFORE UPDATE ON pricing_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();