import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const headerValue = req.headers['x-request-id'];
    let requestId: string;

    if (
      typeof headerValue === 'string' &&
      UUID_REGEX.test(headerValue.trim())
    ) {
      requestId = headerValue.trim();
    } else {
      requestId = randomUUID();
    }

    req.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);
    next();
  }
}
