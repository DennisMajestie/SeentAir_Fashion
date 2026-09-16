import { IsNotEmpty, IsString } from 'class-validator';

export class UpdateStageDto {
  /** Must be one of the configured stage names (config: production.stages). */
  @IsString()
  @IsNotEmpty()
  stage: string;
}
