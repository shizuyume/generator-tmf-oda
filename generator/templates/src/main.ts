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
      service: '{{SERVICE_SLUG}}',
    });
  });

  const config = new DocumentBuilder()
    .setTitle('{{API_TITLE}}')
    .setDescription('{{API_DESCRIPTION}}')
    .setVersion('{{API_VERSION}}')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  const swaggerPath = 'api/docs';
  SwaggerModule.setup(swaggerPath, app, document);

  // {{PORT}} is this component's identity port ('3' + TMF number, e.g. TMF736 -> 3736);
  // PORT in .env overrides it per-environment.
  const port = Number(process.env.PORT) || {{PORT}};
  await app.listen(port, '0.0.0.0');

  logger.log(`{{API_TITLE}} listening on port ${port}`);
  // Swagger UI itself stays enabled in every environment; only the clickable
  // log line is suppressed in production so prod logs don't advertise it.
  if (process.env.NODE_ENV !== 'production') {
    logger.log(`Swagger docs: http://localhost:${port}/${swaggerPath}`);
  }
}
bootstrap();
