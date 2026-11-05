import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthenticatedUser } from '../../common/interfaces';
import { AuditService } from '../audit/audit.service';
import { UpdateBusinessProfileDto } from './dto/update-business-profile.dto';
import { BusinessProfile } from './entities/business-profile.entity';

const PROFILE_ROW_ID = 1;

@Injectable()
export class BusinessService {
  constructor(
    @InjectRepository(BusinessProfile)
    private readonly repo: Repository<BusinessProfile>,
    private readonly audit: AuditService,
  ) {}

  async get(): Promise<BusinessProfile> {
    const profile = await this.repo.findOne({ where: { id: PROFILE_ROW_ID } });
    if (!profile) throw new NotFoundException('Business profile not found');
    return profile;
  }

  async update(dto: UpdateBusinessProfileDto, actor: AuthenticatedUser): Promise<BusinessProfile> {
    const profile = await this.get();
    const before = { ...profile };

    if (dto.name !== undefined) profile.name = dto.name.trim();
    if (dto.legalName !== undefined) profile.legalName = dto.legalName.trim() || null;
    if (dto.address !== undefined) profile.address = dto.address.trim() || null;
    if (dto.phone !== undefined) profile.phone = dto.phone.trim() || null;
    if (dto.email !== undefined) profile.email = dto.email.trim().toLowerCase();
    if (dto.taxId !== undefined) profile.taxId = dto.taxId.trim() || null;
    if (dto.currency !== undefined) profile.currency = dto.currency.toUpperCase();
    if (dto.timezone !== undefined) profile.timezone = dto.timezone;
    if (dto.fiscalStart !== undefined) profile.fiscalStart = dto.fiscalStart;
    if (dto.factoryName !== undefined) profile.factoryName = dto.factoryName.trim() || null;
    if (dto.factoryCity !== undefined) profile.factoryCity = dto.factoryCity.trim() || null;
    if (dto.factoryAddress !== undefined) profile.factoryAddress = dto.factoryAddress.trim() || null;
    if (dto.factoryCapacity !== undefined) profile.factoryCapacity = dto.factoryCapacity;
    if (dto.factoryHours !== undefined) profile.factoryHours = dto.factoryHours.trim() || null;
    if (dto.expiryWarnDays !== undefined) profile.expiryWarnDays = dto.expiryWarnDays;
    if (dto.lowStockMode !== undefined) profile.lowStockMode = dto.lowStockMode;
    if (dto.defaultLocationId !== undefined) {
      profile.defaultLocationId = dto.defaultLocationId.trim() || null;
    }
    if (dto.weekStart !== undefined) profile.weekStart = dto.weekStart;
    if (dto.revenueGoal !== undefined) profile.revenueGoal = dto.revenueGoal;
    profile.updatedBy = actor.id;

    const saved = await this.repo.save(profile);

    await this.audit.record({
      actorId: actor.id,
      action: 'business_profile.update',
      beforeState: { profile: before },
      afterState: { profile: saved },
    });

    return saved;
  }
}
