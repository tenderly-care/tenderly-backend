export default () => ({
  // Application Configuration
  app: {
    name: process.env.APP_NAME || 'Tenderly Backend',
    version: process.env.APP_VERSION || '1.0.0',
    port: parseInt(process.env.PORT || '3000', 10),
    env: process.env.NODE_ENV || 'development',
    apiPrefix: process.env.API_PREFIX || 'api/v1',
    corsOrigins: process.env.CORS_ORIGINS?.split(',') || [
      'http://localhost:3000',
    ],
  },

  // Database Configuration
  database: {
    mongodb: {
      uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/tenderly',
    },
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '0', 10),
      keyPrefix: process.env.REDIS_KEY_PREFIX || 'tenderly:',
      ttl: parseInt(process.env.REDIS_TTL || '3600', 10), // 1 hour default
    },
  },

  // Security Configuration
  security: {
    jwt: {
      secret:
        process.env.JWT_SECRET || 'super-secret-jwt-key-change-in-production',
      accessTokenExpiry: process.env.JWT_ACCESS_EXPIRY || '15m',
      refreshTokenExpiry: process.env.JWT_REFRESH_EXPIRY || '7d',
      algorithm: 'HS256',
      issuer: 'tenderly.care',
      audience: 'tenderly-api',
    },
    encryption: {
      algorithm: 'aes-256-gcm',
      keyDerivationIterations: 100000,
      keySize: 32,
      ivSize: 16,
      tagSize: 16,
      dataEncryptionKey:
        process.env.DATA_ENCRYPTION_KEY || 'change-this-key-in-production',
    },
    cors: {
      enabled: true,
      credentials: true,
      optionsSuccessStatus: 200,
    },
    helmet: {
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https:'],
        },
      },
    },
    rateLimit: {
      ttl: 60, // 1 minute
      limit: 100, // 100 requests per minute
      blockDuration: 60, // Block for 1 minute after limit exceeded
    },
  },

  // Healthcare Configuration
  healthcare: {
    ndhm: {
      baseUrl: process.env.NDHM_BASE_URL || 'https://dev.abdm.gov.in',
      clientId: process.env.NDHM_CLIENT_ID,
      clientSecret: process.env.NDHM_CLIENT_SECRET,
      facilityId: process.env.NDHM_FACILITY_ID,
      hipId: process.env.NDHM_HIP_ID,
      scope: 'abha-enrol',
    },
    fhir: {
      version: 'R4',
      baseUrl: process.env.FHIR_BASE_URL || 'https://hapi.fhir.org/baseR4',
      timeout: 30000,
    },
  },

  // AI Configuration
  ai: {
    symptomChecker: {
      baseUrl: process.env.AI_SYMPTOM_CHECKER_URL,
      apiKey: process.env.AI_SYMPTOM_CHECKER_API_KEY,
      model: process.env.AI_MODEL || 'gpt-3.5-turbo',
      maxTokens: parseInt(process.env.AI_MAX_TOKENS || '1000', 10),
      temperature: parseFloat(process.env.AI_TEMPERATURE || '0.7'),
    },
    diagnosis: {
      baseUrl: process.env.AI_DIAGNOSIS_URL || 'http://localhost:8000',
      apiKey: process.env.AI_DIAGNOSIS_API_KEY,
      secretKey: process.env.AI_DIAGNOSIS_SECRET_KEY || 'development_jwt_secret_key_change_in_production',
      tokenExpiry: parseInt(process.env.AI_DIAGNOSIS_TOKEN_EXPIRY || '3600', 10), // 1 hour
      confidenceThreshold: parseFloat(
        process.env.AI_CONFIDENCE_THRESHOLD || '0.7',
      ),
    },
  },

  // External Integrations
  integrations: {
    whatsapp: {
      accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
      verifyToken: process.env.WHATSAPP_VERIFY_TOKEN,
      businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID,
      baseUrl: 'https://graph.facebook.com/v18.0',
    },
    googleMeet: {
      clientId: process.env.GOOGLE_MEET_CLIENT_ID,
      clientSecret: process.env.GOOGLE_MEET_CLIENT_SECRET,
      redirectUri: process.env.GOOGLE_MEET_REDIRECT_URI,
      scopes: ['https://www.googleapis.com/auth/calendar'],
    },
    razorpay: {
      keyId: process.env.RAZORPAY_KEY_ID,
      keySecret: process.env.RAZORPAY_KEY_SECRET,
      webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET,
      currency: 'INR',
    },
    twilio: {
      accountSid: process.env.TWILIO_ACCOUNT_SID,
      authToken: process.env.TWILIO_AUTH_TOKEN,
      fromNumber: process.env.TWILIO_FROM_NUMBER,
    },
  },

  // File Storage
  storage: {
    aws: {
      region: process.env.AWS_REGION || 'ap-south-1',
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      s3: {
        bucket: process.env.AWS_S3_BUCKET || 'tenderly-documents',
        prescriptionsBucket:
          process.env.AWS_S3_PRESCRIPTIONS_BUCKET || 'tenderly-prescriptions',
        cdnDomain: process.env.AWS_CLOUDFRONT_DOMAIN,
      },
      kms: {
        keyId: process.env.AWS_KMS_KEY_ID,
        aliasName: process.env.AWS_KMS_ALIAS || 'alias/tenderly-encryption',
      },
    },
    local: {
      uploadPath: process.env.LOCAL_UPLOAD_PATH || './uploads',
      maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '26214400', 10), // 25MB
      allowedMimeTypes: [
        'application/pdf',
        'image/jpeg',
        'image/png',
        'image/gif',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ],
    },
  },

  // Logging Configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'json',
    file: {
      enabled: process.env.LOG_FILE_ENABLED === 'true',
      path: process.env.LOG_FILE_PATH || './logs',
      maxSize: process.env.LOG_MAX_SIZE || '10m',
      maxFiles: parseInt(process.env.LOG_MAX_FILES || '5', 10),
    },
    elasticsearch: {
      enabled: process.env.ELASTICSEARCH_ENABLED === 'true',
      node: process.env.ELASTICSEARCH_NODE,
      index: process.env.ELASTICSEARCH_INDEX || 'tenderly-logs',
    },
  },

  // Monitoring Configuration
  monitoring: {
    prometheus: {
      enabled: process.env.PROMETHEUS_ENABLED === 'true',
      endpoint: '/metrics',
      defaultMetrics: true,
    },
    sentry: {
      enabled: process.env.SENTRY_ENABLED === 'true',
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || 'development',
      release: process.env.APP_VERSION || '1.0.0',
    },
    health: {
      timeout: parseInt(process.env.HEALTH_CHECK_TIMEOUT || '5000', 10),
      retries: parseInt(process.env.HEALTH_CHECK_RETRIES || '3', 10),
    },
  },

  // Notification Configuration
  notifications: {
    email: {
      provider: process.env.EMAIL_PROVIDER || 'sendgrid',
      sendgrid: {
        apiKey: process.env.SENDGRID_API_KEY,
        fromEmail: process.env.SENDGRID_FROM_EMAIL || 'noreply@tenderly.care',
        fromName: process.env.SENDGRID_FROM_NAME || 'Tenderly Care',
      },
      smtp: {
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      },
    },
    push: {
      firebase: {
        projectId: process.env.FIREBASE_PROJECT_ID,
        privateKey: process.env.FIREBASE_PRIVATE_KEY,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      },
    },
  },

  // Audit Configuration
  audit: {
    enabled: process.env.AUDIT_ENABLED !== 'false',
    retention: {
      authEvents: parseInt(process.env.AUDIT_AUTH_RETENTION || '2555', 10), // 7 years in days
      dataAccess: parseInt(
        process.env.AUDIT_DATA_ACCESS_RETENTION || '3653',
        10,
      ), // 10 years in days
      systemEvents: parseInt(process.env.AUDIT_SYSTEM_RETENTION || '1095', 10), // 3 years in days
    },
    alerting: {
      enabled: process.env.AUDIT_ALERTING_ENABLED === 'true',
      webhook: process.env.AUDIT_ALERT_WEBHOOK,
      emailRecipients: process.env.AUDIT_ALERT_EMAILS?.split(',') || [],
    },
  },

  // Compliance Configuration
  compliance: {
    dataRetention: {
      patientRecords: parseInt(
        process.env.DATA_RETENTION_PATIENT || '3653',
        10,
      ), // 10 years
      auditLogs: parseInt(process.env.DATA_RETENTION_AUDIT || '2555', 10), // 7 years
      backups: parseInt(process.env.DATA_RETENTION_BACKUP || '2555', 10), // 7 years
    },
    gdpr: {
      enabled: process.env.GDPR_ENABLED === 'true',
      dpoEmail: process.env.GDPR_DPO_EMAIL || 'dpo@tenderly.care',
      dataExportFormat: 'json',
      automaticDeletion: process.env.GDPR_AUTO_DELETE === 'true',
    },
    ndhm: {
      consentValidity: parseInt(process.env.NDHM_CONSENT_VALIDITY || '365', 10), // 1 year in days
      dataShareAudit: true,
      encryptionRequired: true,
    },
  },

  // Feature Flags
  features: {
    aiDiagnosis: process.env.FEATURE_AI_DIAGNOSIS === 'true',
    videoConsultation: process.env.FEATURE_VIDEO_CONSULTATION !== 'false',
    whatsappNotifications:
      process.env.FEATURE_WHATSAPP_NOTIFICATIONS === 'true',
    digitalPrescriptions: process.env.FEATURE_DIGITAL_PRESCRIPTIONS !== 'false',
    emergencyProtocols: process.env.FEATURE_EMERGENCY_PROTOCOLS === 'true',
    ndhmIntegration: process.env.FEATURE_NDHM_INTEGRATION === 'true',
    mfaRequired: process.env.FEATURE_MFA_REQUIRED === 'true',
  },
});
