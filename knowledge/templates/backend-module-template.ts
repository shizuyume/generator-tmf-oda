// ═══════════════════════════════════════════════════════════════════════
// BACKEND MODULE — GOLDEN TEMPLATE
// =====================================================================
// Cara pakai:
// 1. Duplikat folder ini untuk setiap resource:
//    src/{resource-name}/
//    ├── {resource-name}.module.ts
//    ├── {resource-name}.controller.ts
//    ├── {resource-name}.service.ts
//    ├── entities/
//    │   └── main-entity.entity.ts
//    │   └── sub-entity.entity.ts
//    └── dto/
//        ├── create-{resource}.dto.ts
//        └── query-{resource}.dto.ts
// 2. Register di app.module.ts dan entities.ts
// 3. Ceklis backend-checklist.md
// =====================================================================

/* ── Module ─────────────────────────────────────────────────────────── */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventModule } from '../event/event.module';
import { ResourceController } from './resource.controller';
import { ResourceService } from './resource.service';
import { MainEntity } from './entities/main-entity.entity';
import { SubEntity } from './entities/sub-entity.entity';

@Module({
  imports: [TypeOrmModule.forFeature([MainEntity, SubEntity]), EventModule],
  controllers: [ResourceController],
  providers: [ResourceService],
})
export class ResourceModule {}

/* ── Entity ─────────────────────────────────────────────────────────── */
import { Entity, PrimaryColumn, Column, ManyToOne, OneToMany, JoinColumn, CreateDateColumn, UpdateDateColumn, DeleteDateColumn } from 'typeorm';
import { Expose } from 'class-transformer';

@Entity('main_entity')
export class MainEntity {
  @PrimaryColumn({ type: 'varchar', length: 36 }) id: string;
  @Column({ type: 'varchar', length: 255 }) name: string;
  @Column({ type: 'text', nullable: true }) description?: string;

  // Relasi ke sub-resource
  @OneToMany(() => SubEntity, (s) => s.parent, { cascade: true, eager: true, orphanedRowAction: 'delete' })
  subEntities: SubEntity[];

  // Soft-delete
  @DeleteDateColumn() deletedAt?: Date;
  @Column({ type: 'varchar', length: 100, nullable: true }) deletedBy?: string;
  @Column({ type: 'varchar', length: 255, nullable: true }) deletedReason?: string;

  // Audit
  @CreateDateColumn() createdDate: Date;
  @UpdateDateColumn() lastUpdate: Date;

  // TMF Polymorphism
  @Expose({ name: '@type' }) @Column({ type: 'varchar', length: 100, default: 'MainEntity' }) atType: string;
  @Expose({ name: '@schemaLocation' }) @Column({ type: 'varchar', length: 1000, nullable: true }) atSchemaLocation?: string;
  @Expose({ name: '@baseType' }) @Column({ type: 'varchar', length: 100, nullable: true }) atBaseType?: string;
}

/* ── Sub Entity ─────────────────────────────────────────────────────── */
@Entity('sub_entity')
export class SubEntity {
  @PrimaryColumn({ type: 'varchar', length: 36 }) id: string;
  @ManyToOne(() => MainEntity, (m) => m.subEntities, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'parent_id' }) parent: MainEntity;
  @Column({ type: 'varchar', length: 255 }) name: string;
  @Column({ type: 'text', nullable: true }) description?: string;
  @Expose({ name: '@type' }) @Column({ type: 'varchar', length: 100, nullable: true }) atType?: string;
}

/* ── Create DTO ─────────────────────────────────────────────────────── */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDefined, IsString, IsOptional, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateResourceDto {
  @ApiProperty() @IsDefined() @IsString() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() '@type'?: string;
  @ApiPropertyOptional({ type: [SubEntityDto] })
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => SubEntityDto)
  subEntities?: SubEntityDto[];
}

class SubEntityDto {
  @ApiProperty() @IsDefined() @IsString() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
}

export class UpdateResourceDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() '@type'?: string;
}

/* ── Query DTO ──────────────────────────────────────────────────────── */
import { QueryBaseDto } from '../../common/dto/query-base.dto';

export class QueryResourceDto extends QueryBaseDto {
  @ApiPropertyOptional() @IsOptional() @IsString() id?: string;
}

/* ── Controller ─────────────────────────────────────────────────────── */
import { Controller, Get, Post, Patch, Delete, Param, Query, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PaginationInterceptor } from '../../common/interceptors/pagination.interceptor';
import { TMF_BASE_PATH } from '../common/constants/tmf.constants';

@ApiTags('resourceName')
@UseInterceptors(PaginationInterceptor)
@Controller(`${TMF_BASE_PATH}/resourceName`)
export class ResourceController {
  constructor(private readonly service: ResourceService) {}

  @Post() @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateResourceDto) { return this.service.create(dto); }

  @Get()
  findAll(@Query() query: QueryResourceDto) { return this.service.findAll(query); }

  @Get(':id')
  findOne(@Param('id') id: string, @Query('fields') fields?: string) { return this.service.findOne(id, fields); }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateResourceDto) { return this.service.update(id, dto); }

  @Delete(':id') @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) { return this.service.remove(id); }
}

/* ── Service ────────────────────────────────────────────────────────── */
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { EventEmitterService } from '../event/event-emitter.service';
import { EventType } from '../event/event-types';
import { toEntityPayload, toTmfResource, projectFields } from '../common/utils/tmf-resource.util';
import { applyBaseFilters } from '../common/utils/query-helper.util';
import { mapBaseRefInput, mapBaseRefResponse } from '../common/utils/relation-mapper.util';
import { TMF_BASE_PATH } from '../common/constants/tmf.constants';

@Injectable()
export class ResourceService {
  private readonly logger = new Logger(ResourceService.name);

  constructor(
    @InjectRepository(MainEntity) private readonly repository: Repository<MainEntity>,
    @InjectRepository(SubEntity) private readonly subRepo: Repository<SubEntity>,
    private readonly eventEmitter: EventEmitterService,
  ) {}

  async create(dto: CreateResourceDto): Promise<Record<string, any>> {
    const payload = toEntityPayload(dto);
    const entity = this.repository.create({ ...payload, id: uuidv4(), atType: payload.atType || 'MainEntity' });
    if (dto.subEntities) {
      entity.subEntities = dto.subEntities.map((s) => this.subRepo.create({ id: uuidv4(), ...s }));
    }
    const saved = await this.repository.save(entity);
    this.logger.log(`Created ${saved.id}`);
    await this.eventEmitter.emitEvent(EventType.RESOURCE_CREATE, saved.id, 'MainEntity', { id: saved.id, name: saved.name });
    return this.toResponse(saved);
  }

  async findAll(query: QueryResourceDto): Promise<{ data: Record<string, any>[]; total: number }> {
    const { offset = 0, limit = 20, fields } = query;
    const qb = this.repository.createQueryBuilder('e')
      .leftJoinAndSelect('e.subEntities', 's')
      .where('e.deletedAt IS NULL');
    applyBaseFilters(qb, query, 'e', {});
    qb.skip(offset).take(limit);
    const [data, total] = await qb.getManyAndCount();
    return { data: projectFields(data.map((i) => this.toResponse(i)), fields), total };
  }

  async findEntity(id: string): Promise<MainEntity> {
    const e = await this.repository.findOne({ where: { id, deletedAt: IsNull() }, relations: ['subEntities'] });
    if (!e) throw new NotFoundException(`MainEntity ${id} not found`);
    return e;
  }

  async findOne(id: string, fields?: string): Promise<Record<string, any>> {
    const entity = await this.findEntity(id);
    const tmf = this.toResponse(entity);
    return fields ? projectFields([tmf], fields)[0] : tmf;
  }

  async update(id: string, dto: UpdateResourceDto): Promise<Record<string, any>> {
    const existing = await this.findEntity(id);
    const payload = toEntityPayload(dto);
    Object.assign(existing, payload);
    const saved = await this.repository.save(existing);
    await this.eventEmitter.emitEvent(EventType.RESOURCE_CHANGE, saved.id, 'MainEntity', { id: saved.id });
    return this.toResponse(saved);
  }

  async remove(id: string): Promise<void> {
    const entity = await this.findEntity(id);
    entity.deletedAt = new Date();
    entity.deletedBy = 'system';
    entity.deletedReason = 'Deleted via API';
    await this.repository.save(entity);
    await this.eventEmitter.emitEvent(EventType.RESOURCE_DELETE, entity.id, 'MainEntity', { id: entity.id });
  }

  toResponse(entity: MainEntity): Record<string, any> {
    const r = toTmfResource(entity) as Record<string, any>;
    r.href = `/${TMF_BASE_PATH}/resourceName/${entity.id}`;
    delete r.deletedAt; delete r.deletedBy; delete r.deletedReason; delete r.createdDate;
    return r;
  }
}
