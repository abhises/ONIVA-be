/**
 * ONIVA Backend - Main Application
 * Module 5: On-Demand Personal Driver
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const dotenv = require('dotenv');
const path = require('path');
const cookieParser = require('cookie-parser');


// Load environment variables
dotenv.config();

// Import routes
const authRoutes = require('./routes/auth.routes');
const clientRoutes = require('./routes/client.routes');
const driverRoutes = require('./routes/driver.routes');
const tripRoutes = require('./routes/trip.routes');
const adminRoutes = require('./routes/admin.routes');
const locationRoutes = require('./routes/location.routes');

// Import middleware
const { errorHandler } = require('./middleware/errorHandler');
const { authenticate } = require('./middleware/auth');

// Initialize Express app
const app = express();

// Trust proxy for secure cookies behind reverse proxies
app.set('trust proxy', 1);

// Middleware
app.use(helmet());

const rawCorsOrigin = process.env.CORS_ORIGIN || 'http://localhost:3000';
const allowedOrigins = rawCorsOrigin.split(',').map((origin) => origin.trim());

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);
    
    if (rawCorsOrigin === '*' || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    // In development, be more lenient if no origin is specified in ENV
    if (process.env.NODE_ENV !== 'production' && !process.env.CORS_ORIGIN) {
      return callback(null, true);
    }

    return callback(new Error(`CORS origin denied: ${origin}`));
  },
  credentials: true,
}));
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(cookieParser());

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// API Routes (Public)
app.use('/api/auth', authRoutes);

// Protected Routes (Require Authentication)
app.use('/api/client', authenticate, clientRoutes);
app.use('/api/driver', authenticate, driverRoutes);
app.use('/api/trips', authenticate, tripRoutes);
app.use('/api/location', authenticate, locationRoutes);
app.use('/api/admin', authenticate, adminRoutes); // Admin routes should have role check

// Keep-alive endpoint for Hugging Face Spaces (Proxied via Backend)
app.get('/api/keepalive', async (req, res) => {
  try {
    const timestamp = Date.now();
    const services = [
      { name: 'Geocoding', url: process.env.GEOCODING_URL || 'https://abhises-oniva-osm-search.hf.space/search?q=Dakar&format=json&limit=1' },
      { name: 'MapTiles', url: process.env.MAP_TILE_URL || 'https://abhises-oniva-map-tiles.hf.space/tile/0/0/0.png' },
      { name: 'OSRM', url: process.env.OSRM_URL || 'https://abhises-osrm-server.hf.space/route/v1/driving/-17.46,14.71;-17.45,14.72' }
    ];

    const results = await Promise.allSettled(
      services.map(s => {
        // OSRM strictly rejects unknown query parameters with HTTP 400, so we skip adding 't'
        const finalUrl = s.name === 'OSRM'
          ? s.url
          : `${s.url}${s.url.includes('?') ? '&' : '?'}t=${timestamp}`;

        return fetch(finalUrl, { 
          method: 'GET', 
          signal: AbortSignal.timeout(10000) 
        });
      })
    );

    res.status(200).json({
      success: true,
      message: 'Keep-alive pings sent to Hugging Face',
      details: results.map((r, i) => ({
        service: services[i].name,
        status: r.status === 'fulfilled' ? 'Sent' : 'Error',
        error: r.status === 'rejected' ? r.reason?.message : undefined
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});


// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    path: req.path
  });
});

// Error handling middleware (must be last)
app.use(errorHandler);

module.exports = app;