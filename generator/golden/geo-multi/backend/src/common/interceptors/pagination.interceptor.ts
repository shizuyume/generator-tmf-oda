import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Response } from 'express';

@Injectable()
export class PaginationInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map((result) => {
        if (
          result &&
          typeof result === 'object' &&
          'data' in result &&
          'total' in result
        ) {
          const res: Response = context.switchToHttp().getResponse();
          res.setHeader('X-Total-Count', String(result.total));
          res.setHeader('X-Result-Count', String(result.data.length));
          return result.data;
        }
        return result;
      }),
    );
  }
}
