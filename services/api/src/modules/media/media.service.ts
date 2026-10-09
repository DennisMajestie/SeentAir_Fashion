import { ConfigService } from '@nestjs/config';
import { Injectable } from '@nestjs/common';
import type { Request } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/**
 * File storage for product photography.
 *
 * Supports both local disk (dev) and S3-compatible (Supabase/R2/S3) via
 * MEDIA_STORAGE_DRIVER=local|s3. All file access sits behind this service,
 * so the controller, admin UI, and storefront are unchanged.
 */
@Injectable()
export class MediaService {
  private readonly config: ConfigService;
  private readonly driver: 'local' | 's3';
  private readonly s3: S3Client | null;
  private readonly bucket: string;
  private readonly publicUrl: string;

  constructor(config: ConfigService) {
    this.config = config;

    const driver = config.get<string>('media.storageDriver')?.toLowerCase() ?? 'local';
    this.driver = driver === 's3' ? 's3' : 'local';

    // Local fallback (dev)
    const configured = config.get<string>('media.uploadsDir');
    this.uploadsRoot = path.resolve(
      configured && configured.trim() ? configured : path.join(process.cwd(), 'uploads'),
    );
    fs.mkdirSync(this.uploadsRoot, { recursive: true });

    // S3 config
    this.s3 = this.driver === 's3' ? this.createS3Client(config) : null;
    this.bucket = config.get<string>('media.s3.bucket') ?? '';
    this.publicUrl = config.get<string>('media.publicUrl') ?? '';
  }

  /** Exposed for tests. */
  readonly uploadsRoot: string;

  private createS3Client(config: ConfigService): S3Client {
    const endpoint = config.get<string>('media.s3.endpoint');
    const region = config.get<string>('media.s3.region') ?? 'auto';
    const accessKeyId = config.get<string>('media.s3.accessKeyId');
    const secretAccessKey = config.get<string>('media.s3.secretAccessKey');

    if (!endpoint || !accessKeyId || !secretAccessKey) {
      throw new Error('S3 config missing: set MEDIA_S3_ENDPOINT, MEDIA_S3_ACCESS_KEY_ID, MEDIA_S3_SECRET_ACCESS_KEY');
    }

    return new S3Client({
      region,
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: true, // required for Supabase/R2
    });
  }

  /** Absolute local folder for Multer (dev only). */
  productsDir(): string {
    const dir = path.join(this.uploadsRoot, 'products');
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  /** Upload a file buffer to storage, returns the public URL. */
  async uploadFile(key: string, body: Buffer, contentType: string): Promise<string> {
    if (this.driver === 's3') {
      await this.s3!.send(new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }));
      return `${this.publicUrl.replace(/\/$/, '')}/${key}`;
    }
    // Local fallback
    const absPath = path.join(this.uploadsRoot, key);
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    fs.writeFileSync(absPath, body);
    return `${this.publicUrl ?? ''}/${key}`.replace(/\/+/g, '/');
  }

  /** Delete a file from storage. */
  async deleteFile(key: string): Promise<void> {
    if (this.driver === 's3') {
      await this.s3!.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } else {
      const absPath = path.join(this.uploadsRoot, key);
      if (fs.existsSync(absPath)) fs.unlinkSync(absPath);
    }
  }

  /** Check if a file exists. */
  async fileExists(key: string): Promise<boolean> {
    if (this.driver === 's3') {
      try {
        await this.s3!.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
        return true;
      } catch {
        return false;
      }
    }
    return fs.existsSync(path.join(this.uploadsRoot, key));
  }

  /** Get a presigned URL for direct browser upload (optional). */
  async getPresignedUploadUrl(key: string, contentType: string, expiresIn = 3600): Promise<string> {
    if (this.driver !== 's3') throw new Error('Presigned URLs only available with S3 driver');
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });
    return getSignedUrl(this.s3!, command, { expiresIn });
  }

  /**
   * Public base for an uploaded file's advertised URL.
   * In production behind a proxy or on a managed host, MEDIA_PUBLIC_URL pins the real address;
   * elsewhere the request's own origin is used.
   */
  publicBaseUrl(req: Request): string {
    if (this.publicUrl) return this.publicUrl.replace(/\/$/, '');
    return `${req.protocol}://${req.get('host')}`;
  }
}