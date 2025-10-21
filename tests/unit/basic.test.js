// Basic unit tests to verify test framework is working

describe('Basic Test Suite', () => {
  it('should pass a simple test', () => {
    expect(1 + 1).toBe(2);
  });

  it('should work with async operations', async () => {
    const result = await Promise.resolve('test');
    expect(result).toBe('test');
  });

  it('should handle objects correctly', () => {
    const testObj = { name: 'test', value: 123 };
    expect(testObj).toHaveProperty('name', 'test');
    expect(testObj.value).toBeGreaterThan(100);
  });
});

describe('Environment Configuration', () => {
  it('should have NODE_ENV set to test', () => {
    expect(process.env.NODE_ENV).toBe('test');
  });

  it('should load environment variables from .env.test', () => {
    expect(process.env.MONGO_URI).toContain('mongodb+srv://');
    expect(process.env.MONGO_URI).toContain('cluster0.2ajsfot.mongodb.net');
    expect(process.env.PORT).toBe('3001');
  });
});