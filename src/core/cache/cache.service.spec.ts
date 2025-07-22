import { Test, TestingModule } from '@nestjs/testing';
import { CacheService } from './cache.service';

describe('CacheService', () => {
  let service: CacheService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: CacheService,
          useValue: {
            set: jest.fn(),
            get: jest.fn(),
            delete: jest.fn(),
            lock: jest.fn(),
            unlock: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<CacheService>(CacheService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should have set method', () => {
    expect(service.set).toBeDefined();
    expect(typeof service.set).toBe('function');
  });

  it('should have get method', () => {
    expect(service.get).toBeDefined();
    expect(typeof service.get).toBe('function');
  });

  it('should have delete method', () => {
    expect(service.delete).toBeDefined();
    expect(typeof service.delete).toBe('function');
  });

  it('should have lock method', () => {
    expect(service.lock).toBeDefined();
    expect(typeof service.lock).toBe('function');
  });

  it('should have unlock method', () => {
    expect(service.unlock).toBeDefined();
    expect(typeof service.unlock).toBe('function');
  });
});
