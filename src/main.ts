import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import * as compression from 'compression';
import { join } from 'path';

import { AppModule } from './app.module';
import { DoctorShiftService } from './modules/consultations/services/doctor-shift.service';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('app.port') || 3000;
  const apiPrefix = configService.get<string>('app.apiPrefix') || 'api/v1';

  // Security middleware
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'", "'unsafe-inline'", 'https://checkout.razorpay.com'],
          scriptSrcAttr: ["'unsafe-inline'"], // Allow inline event handlers for test pages
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'", 'https://api.razorpay.com', 'https://checkout.razorpay.com', 'https://lumberjack.razorpay.com'],
          frameSrc: ["'self'", 'https://api.razorpay.com'],
        },
      },
    }),
  );

  // Compression middleware
  app.use(compression());

  // Static file serving for test pages
  app.useStaticAssets(join(__dirname, '..', 'public'), {
    prefix: '/test/',
  });

  // CORS configuration
  app.enableCors({
    origin: configService.get<string[]>('app.corsOrigins'),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Strip properties that do not have decorators
      forbidNonWhitelisted: true, // Throw error if non-whitelisted properties are found
      transform: true, // Automatically transform payloads to be objects typed according to their DTO classes
      disableErrorMessages:
        configService.get<string>('app.env') === 'production',
    }),
  );

  // API prefix
  app.setGlobalPrefix(apiPrefix);

  // Swagger documentation
  if (configService.get<string>('app.env') !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Tenderly API')
      .setDescription(
        'Comprehensive API documentation for Tenderly OB-GYN Telemedicine Platform',
      )
      .setVersion('1.1')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
      .addTag(
        'Authentication',
        'User authentication and authorization with full session management',
      )
      .addTag('Sessions', 'Session management and control')
      .addTag('MFA', 'Multi-Factor Authentication management')
      .addTag('Users', 'User profile and role management')
      .addTag('Audit', 'Audit and logging services')
      .addTag('Devices', 'Device verification and management')
      .addTag('Consultations', 'Medical consultations features')
      .addTag('Doctor Shifts', 'Doctor shift management and assignment')
      .addTag('Prescriptions', 'Digital prescriptions handling')
      .addTag('Payments', 'Payment processing and management')
      .addTag('Notifications', 'Real-time notifications services')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup(`${apiPrefix}/docs`, app, document, {
      swaggerOptions: {
        persistAuthorization: true,
      },
    });

    console.log(
      `📚 Swagger docs available at: http://localhost:${port}/${apiPrefix}/docs`,
    );
  }

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down gracefully');
    await app.close();
    process.exit(0);
  });

  // Initialize default doctor shifts
  try {
    const doctorShiftService = app.get(DoctorShiftService);
    await doctorShiftService.initializeDefaultShifts();
    console.log('✅ Default doctor shifts initialized');
  } catch (error) {
    console.error('❌ Failed to initialize default doctor shifts:', error.message);
  }

  await app.listen(port);

  console.log(
    `🚀 Tenderly Backend running on: http://localhost:${port}/${apiPrefix}`,
  );
  console.log(`🌍 Environment: ${configService.get<string>('app.env')}`);
  console.log(
    `🧪 Razorpay Test Page: http://localhost:${port}/test/razorpay-test.html`,
  );
}

bootstrap().catch((error) => {
  console.error('❌ Error starting server:', error);
  process.exit(1);
});
