import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  // `rawBody: true` conserve le corps brut des requêtes : indispensable pour
  // vérifier les signatures HMAC des webhooks sur les octets exacts reçus.
  const app = await NestFactory.create(AppModule, { rawBody: true });

  // Validation stricte de tous les DTO entrants (class-validator) :
  // rejette les champs non déclarés et transforme les payloads en types attendus.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableCors({ origin: process.env.FRONTEND_URL ?? '*', credentials: true });

  await app.listen(process.env.PORT ?? 3001);
  console.log(`API démarrée sur le port ${process.env.PORT ?? 3001}`);
}
bootstrap();
