# Backend Pattern — Quick Start

> **Dokumen ini adalah pointer ke `.opencode/knowledge/`. Pattern lengkap ada di sana.**

## Sebelum implementasi — LOAD WAJIB

```
.opencode/knowledge/templates/backend-module-template.ts   ← Exact module pattern (copas)
.opencode/knowledge/checklists/backend-checklist.md        ← Ceklis sebelum nulis kode
.opencode/knowledge/backend-pattern.md                     ← Referensi detail (203 line)
.opencode/knowledge/architecture.md                        ← Port mapping + event rule
```

## Aturan Kunci

| Item | Aturan |
|------|--------|
| Entities barrel | WAJIB explicit `entities.ts`, NO `autoLoadEntities` |
| TMF Polymorphism | `@Expose({ name: '@type' })` pada `atType` |
| Soft-delete | `@DeleteDateColumn` + deletedBy + deletedReason |
| Primary key | `varchar(36)` UUID — jangan auto-increment |
| Event | Publish-only — NO consumer di domain ini |
| Pagination | `PaginationInterceptor` → X-Total-Count + X-Result-Count headers |

## Referensi Lengkap

Lihat `.opencode/knowledge/backend-pattern.md` untuk detail module structure, controller pattern, service CRUD, dan common utilities.
