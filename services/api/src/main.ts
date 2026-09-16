import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  // rawBody powers webhook signature verification (Paystack HMAC).
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const config = app.get(ConfigService);

  // Cookies carry the httpOnly refresh token (never readable by page JS).
  app.use(cookieParser());

  // Security headers (CSP relaxed only for Swagger UI's inline assets).
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          scriptSrc: ["'self'", "'unsafe-inline'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );

  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  // CORS allowlist — only the three Seentair frontends, never '*'.
  app.enableCors({
    origin: config.get<string[]>('security.corsOrigins'),
    credentials: true,
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Seentair Core API')
    .setDescription('Central business system for Seentair Limited (v1)')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swaggerConfig));

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Seentair API listening on http://localhost:${port}/api/v1 (Swagger at /docs)`);
}

void bootstrap();
