import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { MediaService } from './media.service';

function configWith(values: Record<string, string | undefined>): ConfigService {
  return {
    get: (key: string) => values[key],
  } as unknown as ConfigService;
}

describe('MediaService', () => {
  describe('uploadsRoot', () => {
    it('falls back to <cwd>/uploads when the configured dir is empty', () => {
      // MEDIA_UPLOADS_DIR defaults to '' in configuration.ts, and '' ?? fallback
      // would resolve to the process cwd — which would make the /uploads static
      // route serve the whole API directory.
      const service = new MediaService(configWith({ 'media.uploadsDir': '' }));
      expect(service.uploadsRoot).toBe(path.join(process.cwd(), 'uploads'));
    });

    it('falls back when the configured dir is undefined', () => {
      const service = new MediaService(configWith({}));
      expect(service.uploadsRoot).toBe(path.join(process.cwd(), 'uploads'));
    });

    it('resolves a configured directory', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seentair-media-'));
      try {
        const service = new MediaService(configWith({ 'media.uploadsDir': dir }));
        expect(service.uploadsRoot).toBe(path.resolve(dir));
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  describe('productsDir', () => {
    it('creates and returns <uploadsRoot>/products', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seentair-media-'));
      try {
        const service = new MediaService(configWith({ 'media.uploadsDir': dir }));
        const products = service.productsDir();
        expect(products).toBe(path.join(path.resolve(dir), 'products'));
        expect(fs.existsSync(products)).toBe(true);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  describe('publicBaseUrl', () => {
    const req = { protocol: 'http', get: () => 'localhost:3000' } as never;

    it('uses the request origin when nothing is configured', () => {
      const service = new MediaService(configWith({}));
      expect(service.publicBaseUrl(req)).toBe('http://localhost:3000');
    });

    it('prefers MEDIA_PUBLIC_URL and strips a trailing slash', () => {
      const service = new MediaService(
        configWith({ 'media.publicUrl': 'https://media.seentair.test/' }),
      );
      expect(service.publicBaseUrl(req)).toBe('https://media.seentair.test');
    });
  });
});
