# Database — Pre-Execution Checklist

**WAJIB diceklis SEBELUM menulis TypeORM entities untuk domain baru.**

## Sebelum mulai

- [ ] Load `templates/backend-module-template.ts` — entity pattern reference
- [ ] Load `checklists/database-checklist.md` — checklist ini
- [ ] Load `knowledge/database-pattern.md` — referensi detail

## Naming Conventions

- [ ] Table name: snake_case, singular (`partnership_specification`, `event_log`)
- [ ] Column names: camelCase in TypeScript → snake_case in DB via TypeORM default
- [ ] Foreign key: TypeORM manages join columns automatically (`_id` suffix)
- [ ] Primary key: `varchar(36)` UUID — set in service via `uuidv4()`

## Entity Structure

- [ ] `@PrimaryColumn({ type: 'varchar', length: 36 }) id: string` — NOT auto-generated
- [ ] `name: string` — minimal required field (varchar 255)
- [ ] `description?: string` — optional text field
- [ ] `validFor?: { startDateTime?: string; endDateTime?: string }` — simple-json for TimePeriod
- [ ] TMF polymorphism: `atType`, `atBaseType`, `atSchemaLocation` with `@Expose({ name: '@type' })`

## Soft-Delete (Main Resources ONLY — not sub-entities)

- [ ] `@DeleteDateColumn() deletedAt?: Date` — enables TypeORM soft-delete
- [ ] `@Column({ type: 'varchar', length: 100, nullable: true }) deletedBy?: string`
- [ ] `@Column({ type: 'varchar', length: 255, nullable: true }) deletedReason?: string`

## Audit

- [ ] `@CreateDateColumn() createdDate: Date`
- [ ] `@UpdateDateColumn() lastUpdate: Date`

## Relations

- [ ] `@OneToMany` — `cascade: true, eager: true, orphanedRowAction: 'delete'`
- [ ] `@ManyToOne` — `{ onDelete: 'CASCADE', nullable: false }` + `@JoinColumn({ name: 'fk_id' })`
- [ ] Sub-entities TIDAK perlu soft-delete (di-cascade dari parent)

## Value Objects

- [ ] `TimePeriod` / `validFor` — `@Column({ type: 'simple-json', nullable: true })`
- [ ] `Characteristic.value` — `text` (simplifikasi dari Any)
- [ ] `payload` — `simple-json` untuk event payload

## Events Table

- [ ] `EventLog` uses `@PrimaryGeneratedColumn('uuid')` — berbeda dari entity lain
- [ ] `EventSubscription` — standalone, no FKs

## Entity Registration

- [ ] Semua entities MUST di-register di `entities.ts` barrel export
- [ ] app.module.ts MUST import dari `{ entities }` (NOT autoLoadEntities)

## Migration

- [ ] Dev: `synchronize: true` (SQLite)
- [ ] Prod: `synchronize: false` + migration files
- [ ] Migration files di `src/migrations/` jika perlu
