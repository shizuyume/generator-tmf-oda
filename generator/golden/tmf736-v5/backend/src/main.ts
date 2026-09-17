import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');

  app.enableCors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
    exposedHeaders: ['X-Total-Count', 'X-Result-Count'],
  });

  app.useGlobalPipes(new ValidationPipe({ transform: true }));
  app.useGlobalFilters(new HttpExceptionFilter());

  // Health endpoint
  app.getHttpAdapter().get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date(),
      service: 'revenue-sharing-algorithm-management',
    });
  });

  const config = new DocumentBuilder()
    .setTitle('Revenue Sharing Algorithm Management')
    .setDescription('TMF736 Revenue Sharing Algorithm Management API v5')
    .setVersion('5.0.0')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  const swaggerPath = 'api/docs';
  SwaggerModule.setup(swaggerPath, app, document);

  // 3901 is this component's identity port ('3' + TMF number, e.g. TMF736 -> 3736);
  // PORT in .env overrides it per-environment.
  const port = Number(process.env.PORT) || 3901;
  await app.listen(port, '0.0.0.0');

  logger.log(`Revenue Sharing Algorithm Management listening on port ${port}`);
  // Swagger UI itself stays enabled in every environment; only the clickable
  // log line is suppressed in production so prod logs don't advertise it.
  if (process.env.NODE_ENV !== 'production') {
    logger.log(`Swagger docs: http://localhost:${port}/${swaggerPath}`);
  }
}
bootstrap();
