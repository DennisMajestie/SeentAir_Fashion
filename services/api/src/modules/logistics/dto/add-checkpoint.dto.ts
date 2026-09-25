import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class AddCheckpointDto {
  /** Corridor stop: home, park, hub, transit, delivery, … */
  @IsString()
  @IsNotEmpty()
  zone: string;

  /** Torque-seal id applied at this checkpoint. */
  @IsOptional()
  @IsString()
  sealId?: string;

  @IsOptional()
  @IsString()
  status?: 'on_track' | 'delayed' | 'arrived' | 'handed_over';

  @IsOptional()
  @IsString()
  driverName?: string;

  @IsOptional()
  @IsString()
  driverPhone?: string;

  @IsOptional()
  @IsString()
  note?: string;
}