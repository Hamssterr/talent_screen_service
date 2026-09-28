export function validateEnv(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const requiredEnvs = ['DATABASE_URL', 'JWT_ACCESS_SECRET'];

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

  const emailProvider = (
    (config['EMAIL_PROVIDER'] as string) || 'local'
  ).toLowerCase();
  if (
    emailProvider !== 'local' &&
    emailProvider !== 'smtp' &&
    emailProvider !== 'nodemailer'
  ) {
    throw new Error(
      `[Config Validation Failed] EMAIL_PROVIDER must be 'local', 'smtp' or 'nodemailer', got '${emailProvider}'`,
    );
  }

  if (emailProvider === 'smtp' || emailProvider === 'nodemailer') {
    const mailUser = config['MAIL_USER'] as string;
    const mailPass = config['MAIL_PASSWORD'] as string;
    if (!mailUser || !mailUser.trim() || !mailPass || !mailPass.trim()) {
      throw new Error(
        `[Config Validation Failed] MAIL_USER and MAIL_PASSWORD are required when EMAIL_PROVIDER is '${emailProvider}'`,
      );
    }
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

  // AI Gemini configuration validation
  const geminiApiKey = config['GEMINI_API_KEY'] as string | undefined;
  const geminiModel = config['GEMINI_MODEL'] as string | undefined;
  const hasKey = !!(
    geminiApiKey &&
    typeof geminiApiKey === 'string' &&
    geminiApiKey.trim()
  );
  const hasModel = !!(
    geminiModel &&
    typeof geminiModel === 'string' &&
    geminiModel.trim()
  );

  if (hasKey && !hasModel) {
    throw new Error(
      `[Config Validation Failed] GEMINI_MODEL is required when GEMINI_API_KEY is configured`,
    );
  }

  if (!hasKey && hasModel) {
    throw new Error(
      `[Config Validation Failed] GEMINI_API_KEY is required when GEMINI_MODEL is configured`,
    );
  }

  const timeoutKeys = [
    'AI_PROFILE_TIMEOUT_MS',
    'AI_QUESTION_TIMEOUT_MS',
    'AI_FOLLOW_UP_TIMEOUT_MS',
    'AI_SUMMARY_TIMEOUT_MS',
    'CV_EXTRACTION_MAX_PAGES',
    'CV_EXTRACTION_MAX_TEXT_CHARS',
    'AI_PROCESSING_STALE_MS',
  ];

  for (const tKey of timeoutKeys) {
    const raw = config[tKey];
    if (raw !== undefined && raw !== null && raw !== '') {
      const rawVal =
        typeof raw === 'string' || typeof raw === 'number' ? `${raw}` : '';
      const val = parseInt(rawVal, 10);
      if (isNaN(val) || val <= 0) {
        throw new Error(
          `[Config Validation Failed] ${tKey} must be a positive integer, got '${rawVal}'`,
        );
      }
    }
  }

  return config;
}
