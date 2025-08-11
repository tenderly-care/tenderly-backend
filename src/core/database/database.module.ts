import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const isProduction =
          configService.get<string>('app.env') === 'production';
        return {
          uri: configService.get<string>('database.mongodb.uri'),
          // Production security options
          ...(isProduction && {
            ssl: true,
            authSource: 'admin',
            retryWrites: true,
            w: 'majority',
          }),
          // Connection pool optimization
          minPoolSize: isProduction ? 2 : 1,
          maxPoolSize: isProduction ? 10 : 5,
          // Timeout configurations
          connectTimeoutMS: 10000,
          socketTimeoutMS: 45000,
          serverSelectionTimeoutMS: 5000,
        };
      },
      inject: [ConfigService],
    }),
  ],
  exports: [MongooseModule],
})
export class DatabaseModule {}
