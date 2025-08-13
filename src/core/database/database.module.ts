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
        const mongoUri = configService.get<string>('database.mongodb.uri') || 'mongodb://localhost:27017/tenderly';
        
        // Let the URI handle SSL configuration to avoid conflicts
        const baseConfig: any = {
          uri: mongoUri,
          // Connection pool optimization
          minPoolSize: isProduction ? 2 : 1,
          maxPoolSize: isProduction ? 10 : 5,
          // Timeout configurations
          connectTimeoutMS: 10000,
          socketTimeoutMS: 45000,
          serverSelectionTimeoutMS: 5000,
        };
        
        // Only add SSL config if not already specified in URI
        if (isProduction && !mongoUri.includes('ssl=') && !mongoUri.includes('mongodb+srv://')) {
          baseConfig.ssl = false; // Railway managed MongoDB doesn't use SSL
          baseConfig.authSource = 'admin';
        }
        
        return baseConfig;
      },
      inject: [ConfigService],
    }),
  ],
  exports: [MongooseModule],
})
export class DatabaseModule {}
