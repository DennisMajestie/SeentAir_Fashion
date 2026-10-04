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
    console.log(`Seentair API listening on http://localhost:${port}/api/v1 (Swagger at /docs)`);

    // A deployed API must emit the refresh cookie as SameSite=None; Secure,
    // otherwise the browser withholds it on the cross-site call from the Vercel
    // portals to /auth/refresh. The symptom is not an obvious auth failure: the
    // session dies on every page reload, and authenticated reads then 404 with
    // "Order <id> not found" because tracking() hides unauthenticated callers
    // behind the same 404 it uses for a genuinely missing order. Loud beats
    // silent -- see configuration.ts, where COOKIE_SECURE only defaults to
    // true when it is left unset.
    if (process.env.NODE_ENV === 'production') {
      const secure = process.env.COOKIE_SECURE === undefined ? true : process.env.COOKIE_SECURE === 'true';
      if (!secure) {
        console.warn(
          '[security] COOKIE_SECURE=false with NODE_ENV=production. The refresh cookie will be ' +
            'SameSite=Lax and the browser will not send it cross-site, so sessions will not survive ' +
            'a page reload on the Vercel portals. Set COOKIE_SECURE=true.',
        );
      }
    }
}

void bootstrap();
