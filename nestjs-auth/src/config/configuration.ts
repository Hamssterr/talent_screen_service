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
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },
  mail: {
    host: process.env.MAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.MAIL_PORT || '587', 10),
    user: process.env.MAIL_USER,
    password: process.env.MAIL_PASSWORD,
    from:
      process.env.MAIL_FROM ||
      process.env.MAIL_USER ||
      'noreply@talentscreen.com',
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
});
