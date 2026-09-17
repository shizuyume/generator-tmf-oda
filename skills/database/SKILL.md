# Database Pattern — Quick Start

> **Dokumen ini adalah pointer ke `.opencode/knowledge/`. Pattern lengkap ada di sana.**

## Sebelum implementasi — LOAD WAJIB

```
.opencode/knowledge/checklists/database-checklist.md  ← Ceklis sebelum nulis entity
.opencode/knowledge/database-pattern.md               ← Referensi detail (235 line)
.opencode/knowledge/templates/backend-module-template.ts ← Contoh entity code
```

## Aturan Kunci

| Item | Aturan |
|------|--------|
| Primary key | `varchar(36)` UUID — jangan auto-increment |
| Table name | snake_case singular |
| TMF Polymorphism | `@Expose({ name: '@type' })` pada `atType` |
| Soft-delete | `@DeleteDateColumn` + deletedBy + deletedReason — MAIN ENTITY ONLY |
| OneToMany | `cascade: true, eager: true, orphanedRowAction: 'delete'` |
| simple-json | Untuk value object (`validFor`, `payload`) |
| Barrel | WAJIB explicit `entities.ts`, NO `autoLoadEntities` |

## Referensi Lengkap

Lihat `.opencode/knowledge/database-pattern.md` untuk detail entity conventions, base entity pattern, dan migration strategy.
