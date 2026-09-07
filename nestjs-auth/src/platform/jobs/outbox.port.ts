export interface OutboxEventInput {
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
}

export interface OutboxPort {
  append(event: OutboxEventInput, transactionContext: unknown): Promise<void>;
}

export const OUTBOX_PORT = Symbol('OUTBOX_PORT');
