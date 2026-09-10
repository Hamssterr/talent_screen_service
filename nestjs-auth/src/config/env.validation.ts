export function validateEnv(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const requiredEnvs = [
    'DATABASE_URL',
    'JWT_ACCESS_SECRET',
    'REDIS_HOST',
    'MAIL_USER',
    'MAIL_PASSWORD',
  ];

  const missing = requiredEnvs.filter(
    (key) =>
      !config[key] || (typeof config[key] === 'string' && !config[key].trim()),
  );

  if (missing.length > 0) {
    throw new Error(
      `[Config Validation Failed] Missing required environment variables:\n  - ` +
        missing.join('\n  - '),
    );
  }

  const driver = (config['DOCUMENT_STORAGE_DRIVER'] as string) || 'local';
  if (driver !== 'local' && driver !== 'cloudinary') {
    throw new Error(
      `[Config Validation Failed] DOCUMENT_STORAGE_DRIVER must be 'local' or 'cloudinary', got '${driver}'`,
    );
  }

  if (driver === 'local') {
    const localRoot = config['DOCUMENT_STORAGE_LOCAL_ROOT'] as string;
    if (localRoot !== undefined && !localRoot.trim()) {
      throw new Error(
        `[Config Validation Failed] DOCUMENT_STORAGE_LOCAL_ROOT cannot be empty when using 'local' driver`,
      );
    }
  }

  if (driver === 'cloudinary') {
    const cloudinaryRequired = [
      'CLOUDINARY_CLOUD_NAME',
      'CLOUDINARY_API_KEY',
      'CLOUDINARY_API_SECRET',
    ];
    const missingCloudinary = cloudinaryRequired.filter(
      (key) =>
        !config[key] ||
        (typeof config[key] === 'string' && !config[key].trim()),
    );
    if (missingCloudinary.length > 0) {
      throw new Error(
        `[Config Validation Failed] Missing required Cloudinary environment variables:\n  - ` +
          missingCloudinary.join('\n  - '),
      );
    }
  }

  return config;
}
