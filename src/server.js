/**
 * Server startup and configuration
 */

const app = require('./app');
const { connectDatabase } = require('./config/database');
const { initializeSocket } = require('./services/socket.service');
const logger = require('./utils/logger');

const PORT = process.env.PORT || 5000;
const ENV = process.env.NODE_ENV || 'development';

let server;

const startServer = async () => {
  try {
    // Connect to database
    logger.info('Connecting to database...');
    await connectDatabase();
    logger.info('✓ Database connected successfully');

    // Start HTTP server
    server = app.listen(PORT, () => {
      logger.info(`✓ Server running on port ${PORT} in ${ENV} mode`);
      logger.info(`API URL: http://localhost:${PORT}`);
    });

    // Initialize Socket.io for real-time features
    initializeSocket(server);
    logger.info('✓ WebSocket initialized');

    // Graceful shutdown
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

const shutdown = async () => {
  logger.info('Shutting down gracefully...');
  if (server) {
    server.close(() => {
      logger.info('✓ Server closed');
      process.exit(0);
    });
  } else {
    process.exit(0);
  }

  // Force shutdown after 10 seconds
  setTimeout(() => {
    logger.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
};

// Start the server
startServer();

module.exports = { server, shutdown };