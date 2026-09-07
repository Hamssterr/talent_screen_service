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

  return config;
}
