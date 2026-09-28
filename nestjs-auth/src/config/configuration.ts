export default () => ({
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  swaggerEnabled:
    process.env.SWAGGER_ENABLED !== 'false' &&
    process.env.NODE_ENV !== 'production',
  database: {
    url: process.env.DATABASE_URL,
    logging: process.env.NODE_ENV !== 'production',
  },
  auth: {
    jwtSecret: process.env.JWT_ACCESS_SECRET,
    jwtExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },
  mail: {
    provider: process.env.EMAIL_PROVIDER || 'local',
    host: process.env.MAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.MAIL_PORT || '465', 10),
    user: process.env.MAIL_USER || '',
    password: process.env.MAIL_PASSWORD || '',
    secure: process.env.MAIL_SECURE !== 'false',
    from:
      process.env.EMAIL_FROM ||
      (process.env.MAIL_USER
        ? `Talent Screen <${process.env.MAIL_USER}>`
        : 'TalentScreen <noreply@talentscreen.com>'),
    timeoutMs: parseInt(process.env.EMAIL_TIMEOUT_MS || '10000', 10),
  },
  storage: {
    driver: process.env.DOCUMENT_STORAGE_DRIVER || 'local',
    local: {
      root:
        process.env.DOCUMENT_STORAGE_LOCAL_ROOT || './data/private-documents',
    },
    cloudinary: {
      cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
      apiKey: process.env.CLOUDINARY_API_KEY || '',
      apiSecret: process.env.CLOUDINARY_API_SECRET || '',
      folder: process.env.CLOUDINARY_FOLDER || 'talent-screen/cv',
    },
    maxFileSizeBytes: parseInt(
      process.env.CV_MAX_FILE_SIZE_BYTES || '10485760',
      10,
    ),
  },
  notifications: {
    cryptoKey:
      process.env.NOTIFICATION_PAYLOAD_CRYPTO_KEY ||
      process.env.JWT_ACCESS_SECRET ||
      'default-32-chars-long-secure-key-12345',
    payloadTtlMinutes: parseInt(
      process.env.NOTIFICATION_PAYLOAD_TTL_MINUTES || '10080',
      10,
    ), // 7 days
    sendingStaleMs: parseInt(
      process.env.NOTIFICATION_SENDING_STALE_MS || '120000',
      10,
    ), // 2 minutes
  },
  ai: {
    provider: process.env.AI_PROVIDER || 'gemini',
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    geminiModel: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
    profileTimeoutMs: parseInt(
      process.env.AI_PROFILE_TIMEOUT_MS || '30000',
      10,
    ),
    questionTimeoutMs: parseInt(
      process.env.AI_QUESTION_TIMEOUT_MS || '30000',
      10,
    ),
    followUpTimeoutMs: parseInt(
      process.env.AI_FOLLOW_UP_TIMEOUT_MS || '15000',
      10,
    ),
    followUpMinRemainingMs: parseInt(
      process.env.AI_FOLLOW_UP_MIN_REMAINING_MS || '20000',
      10,
    ),
    followUpRecoveryGraceMs: parseInt(
      process.env.AI_FOLLOW_UP_RECOVERY_GRACE_MS || '5000',
      10,
    ),
    summaryTimeoutMs: parseInt(
      process.env.AI_SUMMARY_TIMEOUT_MS || '30000',
      10,
    ),
  },
  cvExtraction: {
    maxPages: parseInt(process.env.CV_EXTRACTION_MAX_PAGES || '20', 10),
    maxTextChars: parseInt(
      process.env.CV_EXTRACTION_MAX_TEXT_CHARS || '50000',
      10,
    ),
    processingStaleMs: parseInt(
      process.env.AI_PROCESSING_STALE_MS || '120000',
      10,
    ),
  },
});
