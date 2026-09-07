export interface JobOptions {
  delay?: number;
  attempts?: number;
  backoff?: {
    type: 'fixed' | 'exponential';
    delay: number;
  };
  priority?: number;
}

export interface JobReference {
  id: string;
  name: string;
  enqueuedAt: Date;
}

export interface BackgroundJobPort {
  enqueue<T>(
    jobName: string,
    payload: T,
    options?: JobOptions,
  ): Promise<JobReference>;
}

export const BACKGROUND_JOB_PORT = Symbol('BACKGROUND_JOB_PORT');
