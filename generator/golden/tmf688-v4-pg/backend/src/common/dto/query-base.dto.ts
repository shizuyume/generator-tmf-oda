import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class QueryBaseDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fields?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  lifecycleStatus?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sort?: string;

  /**
   * TMF630 JSONPath filter(s), e.g. $[?(@.state=='raised')] or policy[?(@.name=='Roaming')];
   * repeat the parameter to AND several. Parsed and checked by common/filter.
   */
  @ApiPropertyOptional({ type: String, isArray: true })
  @IsOptional()
  filter?: string | string[];
}
