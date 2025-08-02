import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { IPaymentProvider, PaymentProviderType } from '../interfaces/payment-provider.interface';
import { MockPaymentProvider } from '../providers/mock.provider';
import { RazorpayProvider } from '../providers/razorpay.provider';

@Injectable()
export class PaymentProviderFactory {
  private readonly logger = new Logger(PaymentProviderFactory.name);

  constructor(
    private configService: ConfigService,
    private mockProvider: MockPaymentProvider,
    private razorpayProvider: RazorpayProvider,
  ) {}

  getProvider(): IPaymentProvider {
    const providerType = this.configService.get<string>('payment.provider');
    
    this.logger.log(`Using payment provider: ${providerType}`);
    
    switch (providerType) {
      case PaymentProviderType.RAZORPAY:
        return this.razorpayProvider;
        
      case PaymentProviderType.MOCK:
      default:
        if (providerType !== PaymentProviderType.MOCK) {
          this.logger.warn(`Unknown payment provider: ${providerType}, falling back to mock`);
        }
        return this.mockProvider;
    }
  }

  /**
   * Get provider by name (useful for testing specific providers)
   */
  getProviderByName(providerName: string): IPaymentProvider {
    switch (providerName) {
      case PaymentProviderType.RAZORPAY:
        return this.razorpayProvider;
        
      case PaymentProviderType.MOCK:
        return this.mockProvider;
        
      default:
        this.logger.warn(`Unknown provider name: ${providerName}, falling back to mock`);
        return this.mockProvider;
    }
  }

  /**
   * Get all available providers (useful for health checks)
   */
  getAllProviders(): { name: string; provider: IPaymentProvider }[] {
    return [
      { name: PaymentProviderType.MOCK, provider: this.mockProvider },
      { name: PaymentProviderType.RAZORPAY, provider: this.razorpayProvider },
    ];
  }

  /**
   * Check if a provider is configured and available
   */
  isProviderAvailable(providerName: string): boolean {
    try {
      const provider = this.getProviderByName(providerName);
      return provider !== null;
    } catch (error) {
      this.logger.error(`Provider ${providerName} is not available:`, error);
      return false;
    }
  }
}
