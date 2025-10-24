const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

// Cloudflare R2 configuration
const s3Client = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const BUCKET_NAME = process.env.R2_BUCKET_NAME;

class StorageService {
  /**
   * Upload a file to Cloudflare R2
   * @param {Buffer} fileBuffer - File buffer
   * @param {string} fileName - File name with extension
   * @param {string} mimeType - MIME type of the file
   * @returns {Promise<string>} - Public URL of the uploaded file
   */
  async uploadFile(fileBuffer, fileName, mimeType) {
    if (!s3Client || !BUCKET_NAME) {
      throw new Error('R2 storage not configured');
    }

    const key = `recordings/${Date.now()}-${fileName}`;

    const uploadParams = {
      Bucket: BUCKET_NAME,
      Key: key,
      Body: fileBuffer,
      ContentType: mimeType,
      ACL: 'public-read', // Make files publicly accessible
    };

    try {
      const command = new PutObjectCommand(uploadParams);
      await s3Client.send(command);

      // Return public URL
      const publicUrl = `${process.env.R2_PUBLIC_URL}/${key}`;
      return publicUrl;
    } catch (error) {
      console.error('Error uploading file to R2:', error);
      throw new Error('Failed to upload file');
    }
  }

  /**
   * Get a signed URL for private file access
   * @param {string} key - File key
   * @param {number} expiresIn - Expiration time in seconds (default: 3600)
   * @returns {Promise<string>} - Signed URL
   */
  async getSignedUrl(key, expiresIn = 3600) {
    if (!s3Client || !BUCKET_NAME) {
      throw new Error('R2 storage not configured');
    }

    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    try {
      const signedUrl = await getSignedUrl(s3Client, command, { expiresIn });
      return signedUrl;
    } catch (error) {
      console.error('Error generating signed URL:', error);
      throw new Error('Failed to generate signed URL');
    }
  }

  /**
   * Delete a file from Cloudflare R2
   * @param {string} key - File key
   * @returns {Promise<void>}
   */
  async deleteFile(key) {
    if (!s3Client || !BUCKET_NAME) {
      throw new Error('R2 storage not configured');
    }

    const deleteParams = {
      Bucket: BUCKET_NAME,
      Key: key,
    };

    try {
      const command = new DeleteObjectCommand(deleteParams);
      await s3Client.send(command);
    } catch (error) {
      console.error('Error deleting file from R2:', error);
      throw new Error('Failed to delete file');
    }
  }

  /**
   * Upload recording file and return URL
   * @param {Buffer} audioBuffer - Audio file buffer
   * @param {string} fileName - Original file name
   * @returns {Promise<string>} - Public URL
   */
  async uploadRecording(audioBuffer, fileName) {
    return this.uploadFile(audioBuffer, fileName, 'audio/wav');
  }
}

module.exports = new StorageService();
