# DelAuto Testing Framework

This directory contains a comprehensive test suite for the DelAuto delivery automation system. The tests cover all aspects of the application including API routes, services, middleware, utilities, security, and performance.

## Test Structure

```
tests/
├── api/
│   ├── routes/           # API endpoint tests
│   └── webhooks/         # Webhook handler tests
├── services/             # Service layer tests
├── middleware/           # Middleware tests
├── utils/               # Utility function tests
├── integration/         # End-to-end integration tests
├── performance/         # Load and performance tests
├── security/           # Security and vulnerability tests
├── helpers/            # Test data and mock utilities
│   ├── testData.js     # Test data fixtures
│   └── mockData.js     # Mock service responses
├── jest.config.js      # Jest configuration
├── setup.js           # Test environment setup
└── README.md          # This file
```

## Test Categories

### 1. Unit Tests
- **API Routes** (`/api/routes/`): Tests for all REST API endpoints
- **Services** (`/services/`): Tests for business logic services
- **Middleware** (`/middleware/`): Tests for authentication, validation, rate limiting
- **Utilities** (`/utils/`): Tests for helper functions and utilities

### 2. Integration Tests
- **End-to-End** (`/integration/`): Complete workflow testing
- **Database Integration**: Tests with real database operations
- **External Services**: Tests with mocked external APIs

### 3. Performance Tests
- **Load Testing** (`/performance/`): High concurrency and stress testing
- **Memory Usage**: Resource consumption monitoring
- **Response Times**: Performance benchmarking

### 4. Security Tests
- **Authentication**: Token validation and security
- **Authorization**: Role-based access control
- **Input Validation**: XSS, injection attack prevention
- **Rate Limiting**: API abuse prevention

## Running Tests

### Prerequisites
```bash
npm install
```

### Run All Tests
```bash
npm test
```

### Run Specific Test Categories
```bash
# Unit tests only
npm run test:unit

# Integration tests
npm run test:integration

# Performance tests
npm run test:performance

# Security tests
npm run test:security

# Watch mode for development
npm run test:watch

# Coverage report
npm run test:coverage
```

### Run Individual Test Files
```bash
# Specific test file
npx jest tests/api/routes/deliveries.test.js

# Test pattern matching
npx jest --testNamePattern="should create delivery"

# Debug mode
npx jest --runInBand --detectOpenHandles tests/api/routes/deliveries.test.js
```

## Test Environment Setup

### Environment Variables
Create a `.env.test` file with test-specific configuration:

```env
NODE_ENV=test
MONGODB_TEST_URI=mongodb://localhost:27017/delauto_test
REDIS_TEST_URL=redis://localhost:6379/1
JWT_SECRET=test-jwt-secret-key
TWILIO_ACCOUNT_SID=test_account_sid
TWILIO_AUTH_TOKEN=test_auth_token
TWILIO_PHONE_NUMBER=+15551234567
OPENAI_API_KEY=test-openai-key
AWS_ACCESS_KEY_ID=test-aws-key
AWS_SECRET_ACCESS_KEY=test-aws-secret
AWS_S3_BUCKET=test-bucket
```

### Database Setup
Tests use a separate test database that is automatically cleaned between test runs.

### External Service Mocking
External services (Twilio, OpenAI, AWS) are mocked using:
- **Sinon**: For function and object mocking
- **Nock**: For HTTP request mocking
- **Custom Mocks**: Service-specific mock implementations

## Test Data Management

### Test Fixtures (`helpers/testData.js`)
Provides realistic test data with proper relationships:
- Customers with linked phone numbers and preferences
- Agents with performance metrics and specialties
- Deliveries with complete workflow states
- Call logs with recordings and transcriptions

### Mock Services (`helpers/mockData.js`)
Factory functions for creating mock responses:
- Twilio API responses
- OpenAI service responses
- AWS S3 operations
- WebSocket events

## Writing New Tests

### Test File Naming
- Unit tests: `*.test.js`
- Integration tests: `*.integration.test.js`
- Performance tests: `*.performance.test.js`

### Test Structure Template
```javascript
const sinon = require('sinon');
const request = require('supertest');
const app = require('../../src/index.js');
const testData = require('../helpers/testData');

describe('Feature Name', () => {
  beforeEach(() => {
    // Setup code
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('specific functionality', () => {
    it('should handle normal case', async () => {
      // Arrange
      const input = testData.someData;
      
      // Act
      const result = await someFunction(input);
      
      // Assert
      expect(result.success).toBe(true);
    });

    it('should handle error case', async () => {
      // Test error scenarios
    });
  });
});
```

### Best Practices

1. **Isolation**: Each test should be independent
2. **Cleanup**: Always restore mocks and clear test data
3. **Descriptive Names**: Test names should clearly describe the scenario
4. **Arrange-Act-Assert**: Structure tests with clear phases
5. **Edge Cases**: Test boundary conditions and error scenarios
6. **Performance**: Consider test execution time
7. **Maintainability**: Keep tests simple and focused

### Mocking Guidelines

1. **External Services**: Always mock external HTTP calls
2. **Database**: Use test database with proper cleanup
3. **Time**: Mock Date.now() for time-sensitive tests
4. **Random Values**: Mock random generators for predictable tests
5. **File System**: Mock file operations when possible

## Coverage Reports

### Viewing Coverage
```bash
npm run test:coverage
open coverage/lcov-report/index.html
```

### Coverage Targets
- **Statements**: > 90%
- **Branches**: > 85%
- **Functions**: > 90%
- **Lines**: > 90%

### Excluded Files
- Configuration files
- Test files themselves
- Generated code
- Third-party integrations

## Continuous Integration

### GitHub Actions
Tests run automatically on:
- Pull requests
- Pushes to main branch
- Scheduled nightly runs

### Test Pipeline
1. Environment setup
2. Database initialization
3. Unit tests
4. Integration tests
5. Security tests
6. Performance benchmarks
7. Coverage reporting

## Debugging Tests

### Common Issues
1. **Hanging Tests**: Use `--detectOpenHandles` to find unclosed resources
2. **Flaky Tests**: Check for improper mocking or timing issues
3. **Memory Leaks**: Monitor memory usage in long-running test suites
4. **Database State**: Ensure proper cleanup between tests

### Debugging Commands
```bash
# Debug specific test
node --inspect-brk node_modules/.bin/jest tests/api/routes/deliveries.test.js --runInBand

# Verbose output
npm test -- --verbose

# Run with increased timeout
npm test -- --testTimeout=60000
```

## Performance Testing

### Load Test Scenarios
1. **API Endpoints**: High concurrency on critical endpoints
2. **Database Operations**: Bulk operations and complex queries
3. **External Services**: Rate limiting and timeout handling
4. **Memory Usage**: Long-running operations monitoring

### Benchmarks
- API response times: < 200ms (95th percentile)
- Database queries: < 100ms (average)
- Memory usage: Stable under sustained load
- Concurrent users: Support 100+ simultaneous connections

## Security Testing

### Test Categories
1. **Authentication**: Token validation and expiration
2. **Authorization**: Role-based access control
3. **Input Validation**: SQL injection, XSS prevention
4. **Rate Limiting**: API abuse prevention
5. **Data Protection**: Sensitive information masking

### Security Checklist
- [ ] All endpoints require authentication
- [ ] Role-based permissions enforced
- [ ] Input sanitization implemented
- [ ] Rate limiting configured
- [ ] Sensitive data masked in responses
- [ ] Security headers present
- [ ] Webhook signature validation

## Maintenance

### Regular Tasks
1. **Update Dependencies**: Keep test dependencies current
2. **Review Coverage**: Maintain high coverage levels
3. **Performance Baselines**: Update performance benchmarks
4. **Test Data**: Keep test fixtures realistic and current
5. **Documentation**: Update test documentation

### Troubleshooting
- Check test database connectivity
- Verify environment variables
- Ensure external services are mocked
- Review test isolation and cleanup
- Monitor test execution times

## Contributing

When adding new features:
1. Write tests first (TDD approach)
2. Ensure good test coverage
3. Include both positive and negative test cases
4. Update test documentation
5. Verify CI pipeline passes

For questions or issues with the testing framework, consult the team lead or create an issue in the project repository.