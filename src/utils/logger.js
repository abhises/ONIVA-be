/**
 * Logger utility
 * Provides structured logging for the application
 */

const fs = require('fs');
const path = require('path');

const LOG_DIR = process.env.LOG_DIR || path.join(__dirname, '../../logs');
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

// Create logs directory if it doesn't exist
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

const levels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

const getTimestamp = () => {
  return new Date().toISOString();
};

const formatLog = (level, message, data) => {
  const log = {
    timestamp: getTimestamp(),
    level: level.toUpperCase(),
    message,
    ...(data && { data }),
  };
  return JSON.stringify(log);
};

const writeToFile = (level, message, data) => {
  const logFile = path.join(LOG_DIR, `${level}.log`);
  const logEntry = formatLog(level, message, data) + '\n';
  fs.appendFileSync(logFile, logEntry);
};

const logger = {
  error: (message, data) => {
    if (levels[LOG_LEVEL] >= levels.error) {
      console.error(`[ERROR] ${message}`, data || '');
      writeToFile('error', message, data);
    }
  },

  warn: (message, data) => {
    if (levels[LOG_LEVEL] >= levels.warn) {
      console.warn(`[WARN] ${message}`, data || '');
      writeToFile('warn', message, data);
    }
  },

  info: (message, data) => {
    if (levels[LOG_LEVEL] >= levels.info) {
      console.log(`[INFO] ${message}`, data || '');
      writeToFile('info', message, data);
    }
  },

  debug: (message, data) => {
    if (levels[LOG_LEVEL] >= levels.debug) {
      console.debug(`[DEBUG] ${message}`, data || '');
      writeToFile('debug', message, data);
    }
  },
};

module.exports = logger;