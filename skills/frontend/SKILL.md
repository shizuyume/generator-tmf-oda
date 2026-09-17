# Frontend Pattern — Quick Start

> **Dokumen ini adalah pointer ke `.opencode/knowledge/`. Pattern lengkap ada di sana.**

## Sebelum implementasi — LOAD WAJIB

```
.opencode/knowledge/templates/frontend-host-shell.tsx   ← Exact App.tsx (copas)
.opencode/knowledge/templates/frontend-host-shell.css   ← Exact App.css (copas)
.opencode/knowledge/checklists/frontend-checklist.md    ← Ceklis sebelum nulis kode
.opencode/knowledge/frontend-pattern.md                 ← Referensi detail (1313 line)
```

## Cara Pakai Template

1. **Copas** `frontend-host-shell.tsx` ke `{service}/frontend/src/App.tsx`
2. **Copas** `frontend-host-shell.css` ke `{service}/frontend/src/App.css`
3. **Cari** `TODO: CUSTOMIZE` di file tsx — ganti sesuai domain baru
4. **Ceklis** `frontend-checklist.md` sebelum commit

## Aturan Kunci (Ringkasan)

| Item | Aturan |
|------|--------|
| BrowserRouter | WAJIB wrapping AppShell |
| DashboardIcon | 4 filled rects, bukan stroke house |
| Font family | 'Plus Jakarta Sans', 'Segoe UI', Tahoma, sans-serif |
| Sidebar toggle | handleBurgerClick + resize listener auto-collapse 1024px |
| Inline styles | DILARANG — semua pake CSS class |
| Route wildcard | Semua route path WAJIB `/*` suffix |
| Dashboard header | gradient #efe9ff→#fef6ff, border #dbe6f5 |

## Referensi Lengkap

Lihat `.opencode/knowledge/frontend-pattern.md` untuk detail komponen, page pattern, form, dan common remote catalog.
