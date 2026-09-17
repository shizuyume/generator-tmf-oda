import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDefined, IsString, IsOptional } from 'class-validator';

export class CreateSubscriptionDto {
  @ApiProperty()
  @IsDefined()
  @IsString()
  callback: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  query?: string;
}
