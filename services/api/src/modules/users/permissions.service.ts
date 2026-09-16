import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccessLevel, ModuleName, RoleName } from '../../common/enums';
import { Permission } from './entities/permission.entity';

@Injectable()
export class PermissionsService {
  constructor(
    @InjectRepository(Permission)
    private readonly permissionRepo: Repository<Permission>,
  ) {}

  /** Least privilege: a missing row means NO access. */
  async getAccessLevel(role: RoleName, module: ModuleName): Promise<AccessLevel> {
    const permission = await this.permissionRepo.findOne({
      where: { role: { name: role }, module },
      relations: { role: true },
    });
    return permission?.accessLevel ?? AccessLevel.NONE;
  }

  async getMatrixForRole(role: RoleName): Promise<Permission[]> {
    return this.permissionRepo.find({
      where: { role: { name: role } },
      relations: { role: true },
    });
  }
}
