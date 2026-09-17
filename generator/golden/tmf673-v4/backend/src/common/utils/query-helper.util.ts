export function applyBaseFilters(
  qb: any,
  query: { name?: string; lifecycleStatus?: string; q?: string; sort?: string },
  alias: string,
  sortMap: Record<string, string> = {},
): void {
  if (query.name) {
    qb.andWhere(`LOWER(${alias}.name) LIKE LOWER(:name)`, {
      name: `%${query.name}%`,
    });
  }
  if (query.lifecycleStatus) {
    qb.andWhere(`${alias}.lifecycleStatus = :lifecycleStatus`, {
      lifecycleStatus: query.lifecycleStatus,
    });
  }
  if (query.q) {
    qb.andWhere(
      `(LOWER(${alias}.name) LIKE LOWER(:q) OR LOWER(${alias}.description) LIKE LOWER(:q))`,
      { q: `%${query.q}%` },
    );
  }
  if (query.sort) {
    const parts = query.sort.split(',');
    for (const part of parts) {
      const desc = part.startsWith('-');
      const field = desc ? part.slice(1) : part;
      const col = sortMap[field] || `${alias}.${field}`;
      qb.addOrderBy(col, desc ? 'DESC' : 'ASC');
    }
  }
}
