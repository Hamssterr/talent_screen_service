import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { ICurrentUser } from '../decorators/current-user.decorator';

export interface ActorContext {
  userId: string;
  email: string;
  requestId: string;
}

export const CurrentActor = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ActorContext => {
    const req = ctx.switchToHttp().getRequest<Request>();
    const user = req.user as ICurrentUser | undefined;

    if (!user || !user.id) {
      throw new UnauthorizedException('Authentication required');
    }

    return {
      userId: user.id,
      email: user.email,
      requestId: req.requestId || 'unknown-request-id',
    };
  },
);
