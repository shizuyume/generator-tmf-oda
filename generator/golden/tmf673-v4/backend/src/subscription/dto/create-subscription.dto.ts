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

  /** Hub_FVO is Extensible: clients send "@type": "Hub". Accepted, not stored (always Hub). */
  @ApiPropertyOptional({ name: '@type', example: 'Hub' })
  @IsOptional()
  @IsString()
  '@type'?: string;
}
