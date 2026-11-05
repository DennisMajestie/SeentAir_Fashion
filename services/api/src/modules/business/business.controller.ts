import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireAccess } from '../../common/decorators/require-access.decorator';
import { AccessLevel, ModuleName } from '../../common/enums';
import { AuthenticatedUser } from '../../common/interfaces';
import { BusinessService } from './business.service';
import { UpdateBusinessProfileDto } from './dto/update-business-profile.dto';

@ApiTags('Business')
@ApiBearerAuth()
@Controller('business')
export class BusinessController {
  constructor(private readonly business: BusinessService) {}

  @Get('profile')
  @RequireAccess(ModuleName.STAFF_ACCESS, AccessLevel.VIEW)
  get() {
    return this.business.get();
  }

  @Patch('profile')
  @RequireAccess(ModuleName.STAFF_ACCESS, AccessLevel.FULL)
  update(@Body() dto: UpdateBusinessProfileDto, @CurrentUser() user: AuthenticatedUser) {
    return this.business.update(dto, user);
  }
}
