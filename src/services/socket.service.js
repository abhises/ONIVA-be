/**
 * Socket.io Service
 * Handles real-time communication, location updates, and notifications
 */

const socketIO = require('socket.io');
const logger = require('../utils/logger');

let io;
const activeConnections = new Map(); // userId -> socketId

const initializeSocket = (server) => {
  io = socketIO(server, {
    cors: {
      origin: process.env.CORS_ORIGIN || '*',
      credentials: true
    }
  });

  io.on('connection', (socket) => {
    logger.debug('Client connected', { socketId: socket.id });

    // User authentication
    socket.on('auth', (data) => {
      const { userId, userRole } = data;
      activeConnections.set(userId, socket.id);
      socket.userId = userId;
      socket.userRole = userRole;
      
      logger.debug('User authenticated in socket', { userId, socketId: socket.id });
      socket.emit('authenticated', { success: true });
    });

    // Driver location updates
    socket.on('location_update', (data) => {
      const { tripId, latitude, longitude, accuracy } = data;
      
      // Emit to client watching this trip
      io.emit('driver_location_updated', {
        tripId,
        driverId: socket.userId,
        latitude,
        longitude,
        accuracy,
        timestamp: new Date().toISOString()
      });

      logger.debug('Location updated', { userId: socket.userId, tripId });
    });

    // Booking request events
    socket.on('booking_accepted', (data) => {
      const { requestId, tripId } = data;
      io.emit('driver_accepted', {
        requestId,
        tripId,
        driverId: socket.userId,
        timestamp: new Date().toISOString()
      });
      
      logger.info('Booking accepted via socket', { userId: socket.userId, tripId });
    });

    socket.on('booking_rejected', (data) => {
      const { requestId, tripId, reason } = data;
      io.emit('driver_rejected', {
        requestId,
        tripId,
        driverId: socket.userId,
        reason,
        timestamp: new Date().toISOString()
      });
      
      logger.info('Booking rejected via socket', { userId: socket.userId, tripId });
    });

    // Trip events
    socket.on('trip_started', (data) => {
      const { tripId } = data;
      io.emit('trip_status_changed', {
        tripId,
        status: 'in_progress',
        driverId: socket.userId,
        timestamp: new Date().toISOString()
      });
      
      logger.info('Trip started', { tripId, driverId: socket.userId });
    });

    socket.on('trip_completed', (data) => {
      const { tripId, finalPrice, actualDistance, actualDuration } = data;
      io.emit('trip_status_changed', {
        tripId,
        status: 'completed',
        driverId: socket.userId,
        finalPrice,
        actualDistance,
        actualDuration,
        timestamp: new Date().toISOString()
      });
      
      logger.info('Trip completed', { tripId, finalPrice });
    });

    socket.on('trip_cancelled', (data) => {
      const { tripId, reason } = data;
      io.emit('trip_status_changed', {
        tripId,
        status: 'cancelled',
        userId: socket.userId,
        reason,
        timestamp: new Date().toISOString()
      });
      
      logger.info('Trip cancelled', { tripId, reason });
    });

    // Chat/messaging events (for future use)
    socket.on('message', (data) => {
      const { recipientId, message } = data;
      const recipientSocketId = activeConnections.get(recipientId);
      
      if (recipientSocketId) {
        io.to(recipientSocketId).emit('message_received', {
          senderId: socket.userId,
          message,
          timestamp: new Date().toISOString()
        });
      }
      
      logger.debug('Message sent', { from: socket.userId, to: recipientId });
    });

    // Disconnect
    socket.on('disconnect', () => {
      activeConnections.delete(socket.userId);
      logger.debug('Client disconnected', { socketId: socket.id, userId: socket.userId });
    });

    // Error handling
    socket.on('error', (error) => {
      logger.error('Socket error', { error: error.message, socketId: socket.id });
    });
  });

  return io;
};

const getIO = () => {
  if (!io) {
    throw new Error('Socket.io not initialized');
  }
  return io;
};

const notifyDriver = (driverId, event, data) => {
  const socketId = activeConnections.get(driverId);
  if (socketId) {
    io.to(socketId).emit(event, data);
    logger.debug('Driver notified', { driverId, event });
  }
};

const notifyClient = (clientId, event, data) => {
  const socketId = activeConnections.get(clientId);
  if (socketId) {
    io.to(socketId).emit(event, data);
    logger.debug('Client notified', { clientId, event });
  }
};

const broadcastTripUpdate = (tripId, data) => {
  io.emit(`trip_${tripId}`, data);
  logger.debug('Trip update broadcasted', { tripId });
};

module.exports = {
  initializeSocket,
  getIO,
  notifyDriver,
  notifyClient,
  broadcastTripUpdate,
  activeConnections
};