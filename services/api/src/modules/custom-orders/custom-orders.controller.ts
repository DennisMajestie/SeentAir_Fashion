import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { randomUUID } from 'crypto';
import { diskStorage } from 'multer';
import type { File } from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireAccess } from '../../common/decorators/require-access.decorator';
import { AccessLevel, ModuleName } from '../../common/enums';
import { AuthenticatedUser } from '../../common/interfaces';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { MediaService } from '../media/media.service';
import { CustomOrdersService } from './custom-orders.service';
import { CreateCustomOrderDto } from './dto/create-custom-order.dto';
import { IssueQuotationDto } from './dto/issue-quotation.dto';
import { RecordCustomPaymentDto } from './dto/record-custom-payment.dto';
import { UpdateCustomStatusDto } from './dto/update-custom-status.dto';

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const MAX_BYTES = 5 * 1024 * 1024;

const tempUploadDir = path.join(os.tmpdir(), 'seentair-custom-orders');
fs.mkdirSync(tempUploadDir, { recursive: true });

class DecideSampleDto {
  @IsBoolean()
  approved: boolean;

  @IsOptional()
  @IsString()
  note?: string;
}

@ApiTags('Custom Orders')
@ApiBearerAuth()
@Controller('custom-orders')
export class CustomOrdersController {
  constructor(
    private readonly customOrdersService: CustomOrdersService,
    private readonly media: MediaService,
  ) {}

  /**
   * Upload a reference image for a custom design request. Any authenticated
   * buyer can upload a sample/reference photo; the returned URL is sent with
   * the create request (stored under custom-orders/ in media storage).
   */
  @Post('reference-image')
  @ApiConsumes('multipart/form-data')
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
  async uploadReferenceImage(
    @UploadedFile() file: File | undefined,
  ): Promise<{ url: string }> {
    if (!file?.path) {
      throw new BadRequestException('No file was uploaded');
    }
    const fileBuffer = fs.readFileSync(file.path);
    const key = `custom-orders/${path.basename(file.path)}`;
    const url = await this.media.uploadFile(key, fileBuffer, file.mimetype);
    fs.unlinkSync(file.path);
    return { url };
  }

  /** Buyers (customers/wholesalers) submit design requests. */
  @Post()
  create(@Body() dto: CreateCustomOrderDto, @CurrentUser() user: AuthenticatedUser) {
    return this.customOrdersService.create(dto, user);
  }

  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() pagination: PaginationQueryDto,
  ) {
    return this.customOrdersService.findAll(user, pagination.page ?? 1, pagination.limit ?? 20);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.customOrdersService.findById(id, user);
  }

  @Get(':id/quotation')
  async quotation(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    await this.customOrdersService.findById(id, user); // ownership/access check
    return this.customOrdersService.getQuotation(id);
  }

  /** Design approval authority: Manager (APPROVE on custom orders). */
  @Post(':id/quotation')
  @RequireAccess(ModuleName.CUSTOM_ORDERS, AccessLevel.APPROVE)
  issueQuotation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: IssueQuotationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.customOrdersService.issueQuotation(id, dto, user);
  }

  @Post(':id/accept-quote')
  acceptQuote(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.customOrdersService.acceptQuote(id, user);
  }

  /** Full payment of the quoted amount (staff with payments access). */
  @Post(':id/payment')
  recordPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordCustomPaymentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.customOrdersService.recordPayment(id, dto, user);
  }

  /** The buyer's sample decision — the gate before full production. */
  @Post(':id/sample-approval')
  decideSample(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecideSampleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.customOrdersService.decideSample(id, dto.approved, dto.note, user);
  }

  /** Staff move the request through review/production/fulfilment. */
  @Patch(':id/status')
  @RequireAccess(ModuleName.CUSTOM_ORDERS, AccessLevel.FULL)
  updateStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCustomStatusDto) {
    return this.customOrdersService.updateStatus(id, dto.status, dto.note);
  }
}
