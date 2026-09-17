export function mapBaseRefResponse(items: any[]): any[] {
  if (!items || !Array.isArray(items)) return [];
  return items.map((item) => ({
    id: item.id,
    href: item.href,
    name: item.name,
    description: item.description,
    '@referredType': item.atReferredType,
  }));
}
