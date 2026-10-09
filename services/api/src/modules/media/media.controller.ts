import { BadRequestException, Controller, Post, Req, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { randomUUID } from 'crypto';
import { diskStorage } from 'multer';
import type { File } from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { RequireAccess } from '../../common/decorators/require-access.decorator';
import { AccessLevel, ModuleName } from '../../common/enums';
import { MediaService } from './media.service';

/** Still photography is all the storefront renders; 5MB keeps a phone upload honest. */
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const MAX_BYTES = 5 * 1024 * 1024;

// Temp directory for uploads (cleaned up after S3 upload)
const tempUploadDir = path.join(os.tmpdir(), 'seentair-uploads');
fs.mkdirSync(tempUploadDir, { recursive: true });

@ApiTags('Media')
@Controller('media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  /**
   * Upload one product photo.
   *
   * The file is stored temporarily on disk, then uploaded to S3 (or kept locally),
   * and the temp file is deleted. Returns an absolute URL.
   */
  @Post('images')
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @RequireAccess(ModuleName.CATALOGUE, AccessLevel.FULL)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: tempUploadDir,
        filename: (_req, file, cb) => {
          const ext = path.extname(file.originalname).toLowerCase();
          cb(null, `${randomUUID()}${ext}`);
        },
      }),
      limits: { fileSize: MAX_BYTES },
      fileFilter: (_req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (ALLOWED_TYPES.has(file.mimetype) && ALLOWED_EXTENSIONS.has(ext)) {
          cb(null, true);
        } else {
          cb(new BadRequestException('Only JPG, PNG and WebP images are allowed'), false);
        }
      },
    }),
  )
  async uploadImage(
    @Req() req: Request,
    @UploadedFile() file: File | undefined,
  ): Promise<{ url: string }> {
    if (!file?.path) {
      throw new BadRequestException('No file was uploaded');
    }
    const fileBuffer = fs.readFileSync(file.path);
    const ext = path.extname(file.originalname).toLowerCase();
    const key = `products/${path.basename(file.path)}`;
    const url = await this.media.uploadFile(key, fileBuffer, file.mimetype);
    // Clean up temp file
    fs.unlinkSync(file.path);
    return { url };
  }
}