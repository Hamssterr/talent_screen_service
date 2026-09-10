export interface StorageConfig {
  driver: 'local' | 'cloudinary';
  local: {
    root: string;
  };
  cloudinary: {
    cloudName: string;
    apiKey: string;
    apiSecret: string;
    folder: string;
  };
  maxFileSizeBytes: number;
}
