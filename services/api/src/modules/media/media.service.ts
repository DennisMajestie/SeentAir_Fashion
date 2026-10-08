import { ConfigService } from '@nestjs/config';
import { Injectable } from '@nestjs/common';
import type { Request } from 'express';
import * as fs from 'fs';
import * as path from 'path';

/**
 * File storage for product photography.
 *
 * Photos land on local disk under `/uploads` (git-ignored) and the API serves
 * them statically at `/uploads/...`, so an `<img>` can load them with no extra
 * infrastructure. This is a deliberate first step: all file access sits behind
 * this one service, so an S3-compatible backend can replace the disk later
 * without touching the controller, the admin UI, or the storefront.
 */
@Injectable()
export class MediaService {
  private readonly config: ConfigService;
  readonly uploadsRoot: string;

  constructor(config: ConfigService) {
    this.config = config;
    // The config default is '' (env unset), so an empty string must fall back
    // too — `??` alone would resolve '' to the process cwd and make the
    // `/uploads` static route expose the whole API directory.
    const configured = config.get<string>('media.uploadsDir');
    this.uploadsRoot = path.resolve(
      configured && configured.trim() ? configured : path.join(process.cwd(), 'uploads'),
    );
    fs.mkdirSync(this.uploadsRoot, { recursive: true });
  }

  /** Absolute folder the controller asks Multer to write product photos into. */
  productsDir(): string {
    const dir = path.join(this.uploadsRoot, 'products');
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  /**
   * Public base for an uploaded file's advertised URL. In production behind a
   * proxy or on a managed host, `MEDIA_PUBLIC_URL` pins the real address;
   * elsewhere the request's own origin is used, which is the origin the
   * browser is already talking to.
   */
  publicBaseUrl(req: Request): string {
    const configured = this.config.get<string>('media.publicUrl');
    if (configured) return configured.replace(/\/$/, '');
    return `${req.protocol}://${req.get('host')}`;
  }
}