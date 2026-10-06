import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';

/** What a frontend needs to know before it can print an amount of money. */
export interface PublicConfig {
  currencyCode: string;
  currencySymbol: string;
  locale: string;
}

/**
 * Configuration every frontend may read without signing in.
 *
 * Currency and locale are configuration (architectural principle #5), but the
 * frontends had no way to ask for them, so each one typed the naira sign into
 * its templates. This is the one place they now come from.
 *
 * Only values that are safe to show to anyone belong here: nothing secret, and
 * nothing about a customer or an order.
 */
@ApiTags('Configuration')
@Controller('config')
export class PublicConfigController {
  constructor(private readonly config: ConfigService) {}

  @Public()
  @Get('public')
  get(): PublicConfig {
    return {
      currencyCode: this.config.getOrThrow<string>('business.currencyCode'),
      currencySymbol: this.config.getOrThrow<string>('business.currencySymbol'),
      locale: this.config.getOrThrow<string>('business.locale'),
    };
  }
}
