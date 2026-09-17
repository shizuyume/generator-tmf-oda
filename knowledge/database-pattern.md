# Database Patterns

## TypeORM Entity Conventions

### Naming
- **Tables**: snake_case plural (`service_specification`, `event_log`, `spec_related_party`)
- **Columns**: camelCase in TypeScript, snake_case in DB via TypeORM default naming strategy
- **Primary keys**: `varchar(36)` UUID — always generated in service layer via `uuidv4()`
- **Foreign keys**: TypeORM manages join columns automatically with `_id` suffix

### Canonical Entity Structure

```typescript
@Entity('service_specification')
export class ServiceSpecification {
  @Column({ type: 'varchar', length: 36, primary: true }) id: string;
  @Column({ type: 'varchar', length: 255 }) name: string;
  @Column({ type: 'text', nullable: true }) description: string;
  @Column({ type: 'varchar', length: 50, nullable: true }) version: string;
  @Column({ type: 'varchar', length: 50, default: 'Active' }) lifecycleStatus: string;
  @Column({ type: 'boolean', default: false }) isBundle: boolean;
  @Column({ type: 'simple-json', nullable: true }) validFor: { startDateTime?: string; endDateTime?: string };
  @Column({ type: 'simple-json', nullable: true }) targetEntitySchema: Record<string, any>;

  @OneToMany(() => SpecRelatedParty, (rp) => rp.specification, { cascade: true, eager: true, orphanedRowAction: 'delete' })
  relatedParty: SpecRelatedParty[];

  @OneToMany(() => SpecCharacteristic, (c) => c.specification, { cascade: true, eager: true, orphanedRowAction: 'delete' })
  specCharacteristic: SpecCharacteristic[];

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() lastUpdate: Date;

  // Soft Delete Columns
  @DeleteDateColumn({ nullable: true }) deletedAt: Date;
  @Column({ type: 'varchar', length: 100, nullable: true }) deletedBy: string;
  @Column({ type: 'varchar', length: 500, nullable: true }) deletedReason: string;

  // TMF Polymorphic Metadata
  @Column({ type: 'varchar', length: 100, default: 'ServiceSpecification', nullable: true }) atType: string;
  @Column({ type: 'varchar', length: 100, nullable: true }) atBaseType: string;
  @Column({ type: 'varchar', length: 1000, nullable: true }) atSchemaLocation: string;
}
```

### Mandatory Columns
Every entity MUST include:
- `id: string` — Primary key, varchar(36), UUID v4
- `name: string` — Human-readable name
- `lifecycleStatus: string` — Default 'Active'
- `createdAt: Date` — `@CreateDateColumn()`
- `lastUpdate: Date` — `@UpdateDateColumn()`
- **Soft Delete**: `deletedAt: Date` — `@DeleteDateColumn({ nullable: true })`, `deletedBy: string`, `deletedReason: string`
- TMF metadata: `atType`, `atBaseType`, `atSchemaLocation`

### Relationship Entity Pattern (Sub-Entities)

```typescript
@Entity('spec_related_party')
export class SpecRelatedParty {
  @Column({ type: 'varchar', length: 36, primary: true }) id: string;
  @Column({ type: 'varchar', length: 100, nullable: true }) role: string;
  @Column({ type: 'varchar', length: 100, nullable: true }) atType: string;
  @Column({ type: 'varchar', length: 36, nullable: true }) partyId: string;
  @Column({ type: 'varchar', length: 255, nullable: true }) partyName: string;
  @Column({ type: 'varchar', length: 1000, nullable: true }) partyHref: string;

  @ManyToOne(() => ServiceSpecification, (s) => s.relatedParty, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'specification_id' })
  specification: ServiceSpecification;
}
```

Sub-entities always:
- Have their own UUID primary key
- Have `@ManyToOne` back to parent with `onDelete: 'CASCADE'`
- Use `cascade: true, eager: true, orphanedRowAction: 'delete'` on parent's `@OneToMany`
- **Soft Delete**: Include `deletedAt` (`@DeleteDateColumn`), `deletedBy`, `deletedReason` columns (same as parent entity)

## Soft Delete Pattern

### TypeORM Soft Delete

All entities MUST use TypeORM's soft-delete mechanism instead of hard deletion:

```typescript
import { DeleteDateColumn } from 'typeorm';

@DeleteDateColumn({ nullable: true })
deletedAt: Date | null;
```

TypeORM provides built-in soft-delete support:

| Method | Behavior |
|--------|----------|
| `repository.softDelete(id)` | Sets `deletedAt` timestamp (does NOT remove row) |
| `repository.softRemove(entity)` | Sets `deletedAt` on entity and saves |
| `repository.restore(id)` | Clears `deletedAt` (undoes soft-delete) |
| `repository.find()` | Automatically filters out soft-deleted records (WHERE deleted_at IS NULL) |
| `repository.find({ withDeleted: true })` | Includes soft-deleted records |
| `createQueryBuilder().withDeleted()` | Includes soft-deleted records in query |
| `repository.createQueryBuilder('e').andWhere('e.deletedAt IS NULL')` | Manual filter (fallback) |

### Query Behavior

- **`find()` / `findOne()` / `findAndCount()`**: TypeORM automatically appends `AND deleted_at IS NULL`
- **`createQueryBuilder()`**: Does NOT auto-filter — you MUST manually add `.andWhere('e.deletedAt IS NULL')` or use `.withDeleted()` when needed
- **Cascading soft-delete**: TypeORM does NOT cascade soft-delete to related entities automatically — handle sub-entity soft-delete manually in service layer

### Service Layer Soft-Delete Pattern

```typescript
// In service.remove():
async remove(id: string, deletedBy?: string, deletedReason?: string): Promise<void> {
  const entity = await this.findEntity(id);
  await this.repository.save({
    ...entity,
    deletedAt: new Date(),
    deletedBy: deletedBy || 'system',
    deletedReason: deletedReason || 'Deleted via API',
  });
  // ALTERNATIVE (if no audit columns needed):
  // await this.repository.softDelete(id);
  this.eventEmitterService.emitEvent({ eventType: EventType.RESOURCE_DELETE, ... });
}
```

### QueryBuilder Soft-Delete Filter

When using `createQueryBuilder()` (which does NOT auto-filter soft-deletes):

```typescript
async findAll(query: QueryDto): Promise<{ data: ...; total: number }> {
  const qb = this.repository.createQueryBuilder('e')
    .leftJoinAndSelect('e.relatedParty', 'rp')
    .andWhere('e.deletedAt IS NULL');            // ← MUST add manually
  // ...
}

async findOne(id: string): Promise<Entity> {
  return this.repository.findOneOrFail({
    where: { id, deletedAt: IsNull() },           // ← filter soft-deleted
    relations: ['relatedParty'],
  });
}
```

### Admin/Recovery Queries

For admin endpoints or data recovery tools:
```typescript
// Include soft-deleted records
const allRecords = await this.repository.find({ withDeleted: true });

// Find only soft-deleted records
const deletedOnly = await this.repository.find({
  where: { deletedAt: Not(IsNull()) },
  withDeleted: true,
});

// Restore a soft-deleted record
await this.repository.restore(id);
```

---

## Column Type Conventions

| TypeScript Type | DB Column Type | When |
|----------------|---------------|------|
| `string` | `varchar(36)` | UUID primary keys |
| `string` | `varchar(255)` | Short strings (name, role) |
| `string` | `varchar(50)` | Status, version identifiers |
| `string` | `varchar(100)` | Soft-delete actor (`deletedBy`) |
| `string` | `varchar(500)` | Soft-delete reason (`deletedReason`) |
| `string` | `varchar(1000)` | URLs, schema locations |
| `string` | `varchar(2000)` | Callback URLs |
| `string` | `text` | Long descriptions |
| `number` | `integer` / `float` | Numeric values |
| `boolean` | `boolean` | Flags (isBundle, configurable) |
| `Date` | `datetime` | timestamps — use `@CreateDateColumn()`, `@UpdateDateColumn()`, or `@DeleteDateColumn()` |
| `object` | `simple-json` | Nested JSON (validFor, targetEntitySchema, payload) |

## Event Log Entity

```typescript
@Entity('event_log')
export class EventLog {
  @Column({ type: 'varchar', length: 36, primary: true }) id: string;
  @Column({ type: 'varchar', length: 100 }) eventType: string;
  @Column({ type: 'varchar', length: 36 }) resourceId: string;
  @Column({ type: 'varchar', length: 100 }) resourceType: string;
  @Column({ type: 'simple-json', nullable: true }) payload: Record<string, unknown>;
  @CreateDateColumn() timestamp: Date;
}
```

## Migration Strategy

- TypeORM `synchronize: true` is used in dev (DISABLE in production)
- party-service supports `yarn migration:*` commands (generate, run, revert, show)
- Migration config in `typeorm-config.ts` (separate from AppModule)
- Production deployments should use dedicated migration scripts

## Database Configuration (Two Prefix Patterns)

### Pattern 1: `DATABASE_*` (party-service, product-configuration-service, service-management-service)
```
DATABASE_TYPE=sqlite|postgres
DATABASE_HOST, DATABASE_PORT, DATABASE_USER, DATABASE_PASSWORD, DATABASE_NAME
DATABASE_SYNCHRONIZE=true|false
DATABASE_LOGGING=true|false
```

### Pattern 2: `DB_*` (sales-service only)
```
DB_TYPE=postgres|sqlite
DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD, DB_NAME
DB_SYNC=true|false
```

## TypeORM Config Factory (AppModule)

```typescript
TypeOrmModule.forRootAsync({
  useFactory: (configService: ConfigService) => {
    const dbType = configService.get<string>('DATABASE_TYPE') || 'sqlite';
    if (dbType === 'postgres') {
      return { type: 'postgres', host, port, username, password, database, entities, synchronize, logging };
    }
    return { type: 'sqlite', database: configService.get('DATABASE_PATH') || './dev.db', entities, synchronize, logging };
  },
});
```
