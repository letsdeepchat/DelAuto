// WORKING STORAGE SERVICE TESTS - Based on actual implementation
jest.mock('@aws-sdk/client-s3');
jest.mock('@aws-sdk/s3-request-presigner');

const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

describe('StorageService', () => {
  let storageService;
  let mockS3Client;
  const originalEnv = process.env;

  beforeAll(() => {
    // Use values that match .env.test file
    process.env = {
      ...originalEnv,
      R2_ENDPOINT: 'https://test.r2.cloudflarestorage.com',
      R2_ACCESS_KEY_ID: 'test_access_key',
      R2_SECRET_ACCESS_KEY: 'test_secret_key',
      R2_BUCKET_NAME: 'test_bucket',
      R2_PUBLIC_URL: 'https://test.com'
    };

    // Mock S3Client constructor
    mockS3Client = {
      send: jest.fn()
    };
    S3Client.mockImplementation(() => mockS3Client);

    // Mock getSignedUrl
    getSignedUrl.mockResolvedValue('https://signed-url.example.com/file');

    // Load service after mocks are set up
    storageService = require('../../src/services/storageService');
  });

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset the send mock for each test
    mockS3Client.send = jest.fn();
    getSignedUrl.mockResolvedValue('https://signed-url.example.com/file');
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('uploadFile', () => {
    const fileBuffer = Buffer.from('test file content');
    const fileName = 'test-audio.wav';
    const mimeType = 'audio/wav';

    it('should upload file successfully', async () => {
      mockS3Client.send.mockResolvedValue({});

      const result = await storageService.uploadFile(fileBuffer, fileName, mimeType);

      expect(S3Client).toHaveBeenCalledWith({
        region: 'auto',
        endpoint: 'https://test.r2.cloudflarestorage.com',
        credentials: {
          accessKeyId: 'test_access_key',
          secretAccessKey: 'test_secret_key',
        },
      });

      expect(mockS3Client.send).toHaveBeenCalledWith(expect.any(PutObjectCommand));
      
      const call = mockS3Client.send.mock.calls[0][0];
      expect(call.input.Bucket).toBe('test_bucket');
      expect(call.input.Key).toMatch(/^recordings\/\d+-test-audio\.wav$/);
      expect(call.input.Body).toBe(fileBuffer);
      expect(call.input.ContentType).toBe(mimeType);
      expect(call.input.ACL).toBe('public-read');

      expect(result).toMatch(/^https:\/\/test\.com\/recordings\/\d+-test-audio\.wav$/);
    });

    it('should throw error when R2 storage not configured', async () => {
      // Remove environment variables
      delete process.env.R2_BUCKET_NAME;
      
      // Re-require service without bucket name
      jest.resetModules();
      const storageServiceUnconfigured = require('../../src/services/storageService');

      await expect(storageServiceUnconfigured.uploadFile(fileBuffer, fileName, mimeType))
        .rejects.toThrow('R2 storage not configured');
    });

    it('should handle S3 upload error', async () => {
      mockS3Client.send.mockRejectedValue(new Error('S3 error'));

      await expect(storageService.uploadFile(fileBuffer, fileName, mimeType))
        .rejects.toThrow('Failed to upload file');
    });

    it('should generate unique file keys with timestamp', async () => {
      mockS3Client.send.mockResolvedValue({});

      const beforeTime = Date.now();
      await storageService.uploadFile(fileBuffer, fileName, mimeType);
      const afterTime = Date.now();

      const call = mockS3Client.send.mock.calls[0][0];
      const key = call.input.Key;
      const timestamp = parseInt(key.split('-')[0].replace('recordings/', ''));
      
      expect(timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(timestamp).toBeLessThanOrEqual(afterTime);
      expect(key).toContain(fileName);
    });
  });

  describe('getSignedUrl', () => {
    const fileKey = 'recordings/123456-test.wav';

    beforeEach(() => {
      getSignedUrl.mockResolvedValue('https://signed-url.example.com/file');
    });

    it('should generate signed URL successfully', async () => {
      const result = await storageService.getSignedUrl(fileKey);

      expect(getSignedUrl).toHaveBeenCalledWith(
        mockS3Client,
        expect.any(GetObjectCommand),
        { expiresIn: 3600 }
      );

      const command = getSignedUrl.mock.calls[0][1];
      expect(command.input.Bucket).toBe('test_bucket');
      expect(command.input.Key).toBe(fileKey);
      expect(result).toBe('https://signed-url.example.com/file');
    });

    it('should use custom expiration time', async () => {
      const customExpiration = 7200;
      await storageService.getSignedUrl(fileKey, customExpiration);

      expect(getSignedUrl).toHaveBeenCalledWith(
        mockS3Client,
        expect.any(GetObjectCommand),
        { expiresIn: customExpiration }
      );
    });

    it('should throw error when R2 storage not configured', async () => {
      delete process.env.R2_BUCKET_NAME;
      jest.resetModules();
      const storageServiceUnconfigured = require('../../src/services/storageService');

      await expect(storageServiceUnconfigured.getSignedUrl(fileKey))
        .rejects.toThrow('R2 storage not configured');
    });

    it('should handle signed URL generation error', async () => {
      getSignedUrl.mockRejectedValue(new Error('Signing error'));

      await expect(storageService.getSignedUrl(fileKey))
        .rejects.toThrow('Failed to generate signed URL');
    });
  });

  describe('deleteFile', () => {
    const fileKey = 'recordings/123456-test.wav';

    it('should delete file successfully', async () => {
      mockS3Client.send.mockResolvedValue({});

      await storageService.deleteFile(fileKey);

      expect(mockS3Client.send).toHaveBeenCalledWith(expect.any(DeleteObjectCommand));
      
      const call = mockS3Client.send.mock.calls[0][0];
      expect(call.input.Bucket).toBe('test_bucket');
      expect(call.input.Key).toBe(fileKey);
    });

    it('should throw error when R2 storage not configured', async () => {
      delete process.env.R2_BUCKET_NAME;
      jest.resetModules();
      const storageServiceUnconfigured = require('../../src/services/storageService');

      await expect(storageServiceUnconfigured.deleteFile(fileKey))
        .rejects.toThrow('R2 storage not configured');
    });

    it('should handle S3 delete error', async () => {
      mockS3Client.send.mockRejectedValue(new Error('Delete error'));

      await expect(storageService.deleteFile(fileKey))
        .rejects.toThrow('Failed to delete file');
    });
  });

  describe('uploadRecording', () => {
    const audioBuffer = Buffer.from('audio content');
    const fileName = 'recording.wav';

    it('should upload recording with audio/wav mime type', async () => {
      mockS3Client.send.mockResolvedValue({});
      jest.spyOn(storageService, 'uploadFile');

      await storageService.uploadRecording(audioBuffer, fileName);

      expect(storageService.uploadFile).toHaveBeenCalledWith(
        audioBuffer,
        fileName,
        'audio/wav'
      );
    });

    it('should return public URL for recording', async () => {
      mockS3Client.send.mockResolvedValue({});

      const result = await storageService.uploadRecording(audioBuffer, fileName);

      expect(result).toMatch(/^https:\/\/test\.com\/recordings\/\d+-recording\.wav$/);
    });
  });

  describe('configuration', () => {
    it('should initialize S3Client with correct configuration', () => {
      expect(S3Client).toHaveBeenCalledWith({
        region: 'auto',
        endpoint: 'https://test.r2.cloudflarestorage.com',
        credentials: {
          accessKeyId: 'test_access_key',
          secretAccessKey: 'test_secret_key',
        },
      });
    });

    it('should export singleton instance', () => {
      const storageService1 = require('../../src/services/storageService');
      const storageService2 = require('../../src/services/storageService');
      
      expect(storageService1).toBe(storageService2);
    });
  });
});

// WORKING TESTS END HERE - Based on ACTUAL implementation!