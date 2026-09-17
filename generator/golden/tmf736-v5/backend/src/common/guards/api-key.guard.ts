import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (process.env.SKIP_AUTH === 'true') return true;

    const request = context.switchToHttp().getRequest<Request>();
    const apiKey = request.headers['x-api-key'] as string | undefined;
    const expectedKey = process.env.API_KEY || 'dev-key-123';

    if (!apiKey || apiKey !== expectedKey) {
      throw new UnauthorizedException('Invalid or missing API key');
    }
    return true;
  }
}
