import { Transform } from 'class-transformer';
import { EncryptedData } from '../../security/encryption/encryption.service';

// Note: Actual encryption/decryption is handled by middleware in schemas
// This decorator is for marking fields that need encryption

/**
 * Decorator for automatic field encryption in DTOs and schemas
 * Usage: @Encrypt() on any property that needs to be encrypted
 */
export function Encrypt() {
  return function (target: any, propertyKey: string) {
    // Store metadata about encrypted fields
    const encryptedFields =
      Reflect.getMetadata('encrypted:fields', target.constructor) || [];
    encryptedFields.push(propertyKey);
    Reflect.defineMetadata(
      'encrypted:fields',
      encryptedFields,
      target.constructor,
    );

    // Transform for serialization (encrypt when saving to DB)
    Transform(({ value }) => {
      if (value && typeof value === 'string') {
        // This will be handled by pre-save middleware in schemas
        return value;
      }
      return value;
    })(target, propertyKey);

    // Transform for deserialization (decrypt when loading from DB)
    Transform(({ value }) => {
      if (value && typeof value === 'object' && value.encrypted) {
        // This will be handled by post-load middleware in schemas
        return value;
      }
      return value;
    })(target, propertyKey);
  };
}

/**
 * Utility function to check if a field is marked for encryption
 */
export function isEncryptedField(target: any, propertyKey: string): boolean {
  const encryptedFields =
    Reflect.getMetadata('encrypted:fields', target.constructor) || [];
  return encryptedFields.includes(propertyKey);
}

/**
 * Get all encrypted fields for a class
 */
export function getEncryptedFields(target: any): string[] {
  return Reflect.getMetadata('encrypted:fields', target.constructor) || [];
}
