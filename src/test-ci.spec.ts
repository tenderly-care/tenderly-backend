import { testCiPipeline, addNumbers } from './test-ci';

describe('CI Pipeline Test', () => {
  it('should return success message', () => {
    const result = testCiPipeline();
    expect(result).toBe('CI pipeline test successful!');
  });

  it('should add two numbers correctly', () => {
    const result = addNumbers(2, 3);
    expect(result).toBe(5);
  });

  it('should handle negative numbers', () => {
    const result = addNumbers(-1, 1);
    expect(result).toBe(0);
  });
});
