# Backend Patterns

## Technology Stack

- **Framework**: NestJS 10 with Express platform
- **ORM**: TypeORM 0.3.x (0.3.17 most common; sales-service uses 0.3.28)
- **Database**: PostgreSQL (prod) / SQLite (dev)
- **Validation**: class-validator + class-transformer
- **API Docs**: @nestjs/swagger (Swagger UI)
- **Events**: @nestjs/event-emitter (internal) + amqplib (RabbitMQ)
- **UUID**: uuid v4

## Module Structure (Canonical)

```
└── domain-name/
    ├── domain-name.module.ts       # NestJS module declaration
    ├── domain-name.controller.ts   # REST endpoints
    ├── domain-name.service.ts      # Business logic
    ├── entities/
    │   ├── main-entity.entity.ts   # Primary TypeORM entity
    │   └── sub-entity.entity.ts    # Related/sub entities
    └── dto/
        ├── create-*.dto.ts         # Create + Update DTOs
        └── query-*.dto.ts          # List/filter DTO (extends QueryBaseDto)
```

## Controller Pattern

```typescript
@ApiTags('resourceName')
@UseInterceptors(PaginationInterceptor)
@Controller(`${TMF_BASE_PATH}/resource`)
export class ResourceController {
  constructor(private readonly service: ResourceService) {}

  @Post() @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateDto) { return this.service.create(dto); }

  @Get()
  findAll(@Query() query: QueryDto) { return this.service.findAll(query); }

  @Get(':id')
  findOne(@Param('id') id: string, @Query('fields') fields?: string) { return this.service.findOne(id, fields); }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateDto) { return this.service.update(id, dto); }

  @Delete(':id') @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) { return this.service.remove(id); }
}
```

Key rules:
- Always annotated with `@ApiTags` and `@UseInterceptors(PaginationInterceptor)`
- Base path via constant: `TMF633_BASE_PATH = 'tmf-api/serviceCatalogManagement/v4'`
- `@HttpCode(HttpStatus.NO_CONTENT)` on DELETE; `@HttpCode(HttpStatus.CREATED)` on POST
- `@Query('fields')` for TMF field projection on GET /:id
- DELETE performs soft-delete (sets `deletedAt`, `deletedBy`, `deletedReason`) — never hard-deletes

## Service Layer Pattern

```typescript
@Injectable()
export class ResourceService {
  constructor(
    @InjectRepository(MainEntity) private readonly repository: Repository<MainEntity>,
    private readonly eventEmitterService: EventEmitterService,
  ) {}

  async create(dto: CreateDto): Promise<Record<string, any>> {
    const payload = toEntityPayload(dto);
    const entity = this.repository.create({ ...payload, id: uuidv4(), atType: 'ResourceType' });
    entity.relatedParty = mapRelatedPartyInput(dto.relatedParty, { parentRef });
    const saved = await this.repository.save(entity);
    this.eventEmitterService.emitEvent({ eventType: EventType.RESOURCE_CREATE, ... });
    return this.toResponse(saved);
  }

  async findAll(query: QueryDto): Promise<{ data: Record<string, any>[]; total: number }> {
    const { offset = 0, limit = 20, fields } = query;
    const qb = this.repository.createQueryBuilder('alias')
      .leftJoinAndSelect('alias.relatedParty', 'rp')
      .andWhere('alias.deletedAt IS NULL');           // ← Exclude soft-deleted records
    applyBaseFilters(qb, query, 'alias', SORT_MAP);
    qb.skip(offset).take(limit);
    const [data, total] = await qb.getManyAndCount();
    return { data: projectFields(data.map(i => this.toResponse(i)), fields), total };
  }

  async findOne(id: string, fields?: string): Promise<Record<string, any>> {
    const entity = await this.findEntity(id);
    const tmf = this.toResponse(entity);
    return fields ? projectFields([tmf], fields)[0] : tmf;
  }

  async update(id: string, dto: UpdateDto): Promise<Record<string, any>> {
    const existing = await this.findEntity(id);
    const payload = toEntityPayload(dto);
    // Delete-then-reinsert for sub-entities when updated
    if (dto.relatedParty !== undefined) await this.clearRelatedParties(id);
    const saved = await this.repository.save({ ...existing, ...payload });
    this.eventEmitterService.emitEvent({ ... });
    return this.toResponse(saved);
  }

  async remove(id: string, deletedBy?: string, deletedReason?: string): Promise<void> {
    const entity = await this.findEntity(id);
    // Soft-delete: set audit columns instead of hard-removing the row
    await this.repository.save({
      ...entity,
      deletedAt: new Date(),
      deletedBy: deletedBy || 'system',
      deletedReason: deletedReason || 'Deleted via API',
    });
    this.eventEmitterService.emitEvent({ eventType: EventType.RESOURCE_DELETE, ... });
  }
}
```

## Common Utilities

| Utility | Location | Purpose |
|---------|----------|---------|
| `toEntityPayload()` | `common/utils/tmf-resource.util.ts` | Converts `@type` → `atType` for DB storage |
| `toTmfResource()` | `common/utils/tmf-resource.util.ts` | Converts `atType` → `@type` for API response |
| `projectFields()` | `common/utils/tmf-resource.util.ts` | TMF field projection (`?fields=id,name`) |
| `applyBaseFilters()` | `common/utils/query-helper.util.ts` | TMF630-compliant query building (lifecycleStatus, name, q, sort) |
| `mapRelatedPartyInput()` | `common/utils/relation-mapper.util.ts` | Maps TMF relatedParty array to entity relations |
| `mapBaseRefInput()` | `common/utils/relation-mapper.util.ts` | Maps base reference arrays (single + array input) |
| `mapRelatedPartyResponse()` | `common/utils/response-mapper.util.ts` | Maps entity relations back to TMF response format |
| `mapBaseRefResponse()` | `common/utils/response-mapper.util.ts` | Maps base refs back to TMF format |
| `QueryBaseDto` | `common/dto/query-base.dto.ts` | Base DTO with fields, offset, limit, name, lifecycleStatus, q, sort |

## PaginationInterceptor

Located at `common/interceptors/pagination.interceptor.ts`. Transforms `{ data, total }` from service layer into:
- Sets `X-Total-Count` and `X-Result-Count` response headers
- Returns only the `data` array in response body

## HttpExceptionFilter

Located at `common/filters/http-exception.filter.ts`. Global catch-all filter returning:
```json
{ "statusCode": 500, "timestamp": "...", "path": "/api/...", "method": "GET", "message": "..." }
```
Includes `details` field only when `NODE_ENV=development`.

## Event-Driven Pattern (Publish-Only)

**Aturan arsitektur:** Setiap domain TMF hanya **mengirim (publish)** event. Tidak ada consumer di domain domain. Semua consume event ditangani oleh **Process Flow Orchestrator** — domain terpisah.

Triple-emission in `EventEmitterService.emitEvent()`:
1. **Internal**: `EventEmitter2` (nestjs/event-emitter) for in-process handlers
2. **Storage**: `EventStoreService` persists to `event_log` table
3. **Messaging**: `RabbitMqService` publishes to RabbitMQ topic exchange

RabbitMQ setup (publish-only — NO queue binding di domain ini):
- Exchange: `{domain}.events` (topic, durable) — misal `partnership.events`
- Domain TIDAK boleh membuat queue/binding sendiri
- Auto-reconnect with configurable delay

Event type naming: `{resource}{Action}Event` (e.g., `partnershipCreateEvent`)
Enum pattern in `EventType` enum per service module.

## Subscription/Hub Pattern

Two endpoints on `/tmf-api/{api}/v{version}/hub`:
- `POST /hub` — Register callback `{ callback: string, query?: string }`
- `DELETE /hub/:id` — Unregister subscription

Entities: `EventSubscription` with `id`, `callback`, `query` columns.

## Main.ts Bootstrap Pattern

```typescript
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: process.env.CORS_ORIGIN || '*', credentials: true, exposedHeaders: ['X-Total-Count', 'X-Result-Count'] });
  app.useGlobalPipes(new ValidationPipe({ transform: true }));
  app.useGlobalFilters(new HttpExceptionFilter());
  // Swagger setup
  const config = new DocumentBuilder().setTitle('...').setVersion(process.env.API_VERSION || '4.0.0').build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));
  await app.listen(process.env.PORT || 3006, '0.0.0.0');
}
```

## Entity Barrel Pattern

Services use a central `entities.ts` file that exports an array of all entities for TypeORM registration:

```typescript
// entities.ts
import { EntityA } from './module-a/entities/entity-a.entity';
import { EntityB } from './module-b/entities/entity-b.entity';
export const entities = [EntityA, EntityB, ...];
```

## TypeORM Config (AppModule)

Dual-mode database factory:
- `DATABASE_TYPE=postgres` → PostgreSQL config with host/port/username/password/name
- `DATABASE_TYPE=sqlite` (default) → SQLite with `DATABASE_PATH` or `./dev.db`
- `DATABASE_SYNCHRONIZE=true` for dev (disable in prod, use migrations)
