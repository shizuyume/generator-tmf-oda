# Backend — Pre-Execution Checklist

**WAJIB diceklis SEBELUM menulis kode backend untuk domain baru.**

## Sebelum mulai

- [ ] Load `templates/backend-module-template.ts` — exact code reference
- [ ] Load `checklists/backend-checklist.md` — checklist ini

## Project Structure

- [ ] `sales-service/backend/package.json` menggunakan `@nest` dependencies
- [ ] `src/entities.ts` — barrel export explicit (NO `autoLoadEntities`)
- [ ] `src/main.ts` — CORS, ValidationPipe, Swagger, global HttpExceptionFilter
- [ ] `src/app.module.ts` — ConfigModule, EventEmitterModule, TypeOrmModule dual-mode (sqlite/postgres)
- [ ] `.env` — `DATABASE_TYPE`, `DATABASE_PATH`, `DATABASE_SYNCHRONIZE`

## Module Structure

SETIAP module WAJIB punya folder sendiri dengan sub-direktori dto/ dan entities/:

```
src/
  {domain}/                          ← Folder module sendiri
    dto/
      create-{domain}.dto.ts         ← Create DTO
      update-{domain}.dto.ts         ← Update DTO
      query-{domain}.dto.ts          ← Query params (extends QueryBaseDto)
    entities/
      {domain}.entity.ts             ← Entity definition
      {sub-entity}.entity.ts         ← Sub-entities (jika ada)
    {domain}.controller.ts           ← @ApiTags, @UseInterceptors(PaginationInterceptor)
    {domain}.module.ts               ← TypeOrmModule.forFeature([...]) + imports EventModule
    {domain}.service.ts              ← @Injectable(), inject repositories + EventEmitterService
```

- [ ] `{domain}/` folder untuk setiap module — jangan flat structure
- [ ] `{domain}/dto/` — Create + Update + Query DTOs
- [ ] `{domain}/entities/` — Entity + sub-entities
- [ ] `{domain}/{domain}.controller.ts` — `@ApiTags`, `@UseInterceptors(PaginationInterceptor)`
- [ ] `{domain}/{domain}.module.ts` — `TypeOrmModule.forFeature([...])` + imports `EventModule`
- [ ] `{domain}/{domain}.service.ts` — `@Injectable()`, inject repositories + EventEmitterService

## Entity

- [ ] `@PrimaryColumn({ type: 'varchar', length: 36 }) id` — NOT auto-increment
- [ ] `@Expose({ name: '@type' })` on `atType` column — TMF polymorphism
- [ ] `@DeleteDateColumn() deletedAt` — soft-delete (main entities only, not sub-entities)
- [ ] `deletedBy` + `deletedReason` columns (varchar)
- [ ] `@CreateDateColumn() createdDate` + `@UpdateDateColumn() lastUpdate`
- [ ] Sub-entities: `cascade: true, eager: true, orphanedRowAction: 'delete'`
- [ ] `simple-json` untuk value object (validFor, payload)

## Controller

- [ ] POST → `@HttpCode(201)`, DELETE → `@HttpCode(204)`
- [ ] GET `/` → `@Query() query: QueryDto`
- [ ] GET `/:id` → `@Query('fields') fields?: string` untuk field projection
- [ ] Base path MUST use constant: `TMF_BASE_PATH`

## Service

- [ ] `create`: `toEntityPayload(dto)` → `repo.create` → set uuid + atType → `repo.save` → emit event → `toResponse`
- [ ] `findAll`: `QueryBuilder` with `deletedAt IS NULL` + `leftJoinAndSelect` + `applyBaseFilters` + `skip/take`
- [ ] `findEntity(id)`: `findOne` with relations → `NotFoundException` jika null
- [ ] `update`: merge scalar + delete-then-reinsert sub-entities → emit event
- [ ] `remove`: soft-delete (set deletedAt/deletedBy/deletedReason) → emit event
- [ ] `toResponse`: `toTmfResource` → build `href` → strip internal fields (deletedAt, dll)

## Event (Publish-Only)

- [ ] `EventEmitterService.emitEvent()` — triple emission: EventEmitter2 + event_log + RabbitMQ
- [ ] Event type enum: `RESOURCE_CREATE`, `RESOURCE_CHANGE`, `RESOURCE_DELETE`
- [ ] NO consumer/queue binding di domain ini (hanya publish)
- [ ] RabbitMQ exchange name: `{domain}.events` (topic, durable)

## Common Utils

- [ ] `common/utils/tmf-resource.util.ts` — toEntityPayload, toTmfResource, projectFields
- [ ] `common/utils/query-helper.util.ts` — applyBaseFilters
- [ ] `common/dto/query-base.dto.ts` — fields, offset, limit, name, lifecycleStatus, q, sort
- [ ] `common/interceptors/pagination.interceptor.ts` — X-Total-Count, X-Result-Count
- [ ] `common/filters/http-exception.filter.ts` — TMF-style error response
