// The same log format as the studio's other bots: "[ HH:mm:ss DD-MM-YYYY ] message", coloured by level in the console.
// Tipoff never logs message content, report notes or usernames: only IDs and case numbers.
const path = require("node:path");
const winston = require("winston");
require("winston-daily-rotate-file");

const levels = {
  error: 0,
  warn: 1,
  info: 2,
  success: 3
};

winston.addColors({
  error: "red",
  warn: "yellow",
  info: "blue",
  success: "green"
});

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: "HH:mm:ss DD-MM-YYYY" }),
  winston.format.printf(({ timestamp, message }) => `[ ${timestamp} ] ${message}`)
);

const transports = [
  new winston.transports.Console({
    format: winston.format.combine(winston.format.colorize({ all: true }), logFormat)
  })
];

// tests log to the console only
if (process.env.NODE_ENV !== "test") {
  transports.push(new winston.transports.DailyRotateFile({
    dirname: path.join(__dirname, "..", "logs"),
    filename: "tipoff-%DATE%.log",
    datePattern: "YYYY-MM-DD",
    zippedArchive: true,
    maxSize: "20m",
    maxFiles: "30d",
    format: logFormat
  }));
}

// While shutting down (index.js sets TIPOFF_CLOSING), work that finishes after the database has closed fails with
// "Pool is closed". That's expected then, so it isn't logged (or sent to error tracking).
const dropAfterClose = winston.format(info => (process.env.TIPOFF_CLOSING === "1" && /Pool is closed/.test(String(info.message)) ? false : info));

const logger = winston.createLogger({
  levels,
  level: process.env.NODE_ENV === "test" ? "warn" : "success",
  format: dropAfterClose(),
  transports
});

logger.success = message => logger.log({ level: "success", message });

// banner and table lines, printed as they are
logger.raw = message => console.log(message);

module.exports = logger;
