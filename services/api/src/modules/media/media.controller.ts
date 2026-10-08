import { BadRequestException, Controller, Post, Req, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { randomUUID } from 'crypto';
import { diskStorage } from 'multer';
import type { File } from 'multer';
import * as path from 'path';
import { RequireAccess } from '../../common/decorators/require-access.decorator';
import { AccessLevel, ModuleName } from '../../common/enums';
import { MediaService } from './media.service';

/** Still photography is all the storefront renders; 5MB keeps a phone upload honest. */
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const MAX_BYTES = 5 * 1024 * 1024;

/** Set by the controller constructor; see the comment there. */
let uploadTarget: string;

@ApiTags('Media')
@Controller('media')
export class MediaController {
  constructor(private readonly media: MediaService) {
    // Multer's destination callback runs per request, but the arrow in the
    // decorator below is created at module load — where `this` is void — so it
    // must read the folder from module scope. This is assigned before the
    // server starts listening, so every request sees it set.
    uploadTarget = this.media.productsDir();
  }

  /**
   * Upload one product photo.
   *
   * The file is stored as `uploads/products/<uuid>.<ext>` and the response is
   * an absolute URL the admin UI writes straight into the product. The request
   * needs full catalogue access — only staff who can edit products may put
   * bytes on this machine.
   */
  @Post('images')
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @RequireAccess(ModuleName.CATALOGUE, AccessLevel.FULL)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => cb(null, uploadTarget),
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
  uploadImage(
    @Req() req: Request,
    @UploadedFile() file: File | undefined,
  ): { url: string } {
    if (!file?.filename) {
      throw new BadRequestException('No file was uploaded');
    }
    return { url: `${this.media.publicBaseUrl(req)}/uploads/products/${file.filename}` };
  }
}