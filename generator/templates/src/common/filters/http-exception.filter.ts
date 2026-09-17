import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
} from '@nestjs/common';
import { Response } from 'express';

const STATUS_REASON_MAP: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  406: 'Not Acceptable',
  409: 'Conflict',
  410: 'Gone',
  422: 'Unprocessable Entity',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
};

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();
    const message =
      typeof exceptionResponse === 'object' &&
      'message' in (exceptionResponse as object)
        ? (exceptionResponse as any).message
        : exceptionResponse;

    response.status(status).json({
      code: String(status),
      reason: STATUS_REASON_MAP[status] || 'Unknown',
      message: Array.isArray(message) ? message.join('; ') : String(message),
      status: String(status),
      referenceError: exception.constructor.name,
      '@type': 'Error',
    });
  }
}
