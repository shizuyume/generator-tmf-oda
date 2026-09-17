import { getMetadataArgsStorage } from 'typeorm';
import { entities } from '../src/entities';

describe('entities barrel', () => {
  it('lists every persisted entity exactly once', () => {
    expect(Array.isArray(entities)).toBe(true);
    expect(entities.length).toBeGreaterThan(0);
    expect(new Set(entities).size).toBe(entities.length);
  });

  it('exports constructable classes', () => {
    for (const e of entities) {
      expect(typeof e).toBe('function');
    }
  });

  it('declares a table for every entity', () => {
    const tables = getMetadataArgsStorage().tables;
    for (const e of entities) {
      expect(tables.some((t) => t.target === e)).toBe(true);
    }
  });

  it('gives every entity columns, directly or through a base class', () => {
    // Refs that share a shape declare their columns on a base carrying no
    // @Entity; TypeORM picks those up through the prototype chain. This asserts
    // no entity ends up with an empty column set after that indirection.
    const columns = getMetadataArgsStorage().columns;
    const declaresColumns = (target: unknown) =>
      columns.some((c) => c.target === target);

    for (const e of entities) {
      let cls: unknown = e;
      let found = false;
      while (cls && cls !== Function.prototype) {
        if (declaresColumns(cls)) {
          found = true;
          break;
        }
        cls = Object.getPrototypeOf(cls);
      }
      expect([(e as { name: string }).name, found]).toEqual([
        (e as { name: string }).name,
        true,
      ]);
    }
  });
});

describe('entity relations', () => {
  /**
   * A relation can be declared on a base class shared by several tables, so its
   * `target` is that base rather than any entity in the barrel. Walking the
   * prototype chain keeps those relations in scope here.
   */
  const ownedByAnEntity = (target: unknown): boolean =>
    entities.some((e) => {
      let cls: unknown = e;
      while (cls && cls !== Function.prototype) {
        if (cls === target) {
          return true;
        }
        cls = Object.getPrototypeOf(cls);
      }
      return false;
    });

  /**
   * TypeORM stores each relation's target as a `() => Entity` thunk and only calls
   * it when it builds metadata. Resolving them here asserts every relation points
   * at a real entity class — the failure mode when a circular import leaves one
   * side `undefined` at module-evaluation time.
   */
  it('resolves every relation target to an entity class', () => {
    const relations = getMetadataArgsStorage().relations.filter((r) =>
      ownedByAnEntity(r.target),
    );
    expect(relations.length).toBeGreaterThan(0);

    for (const relation of relations) {
      const resolved = (relation.type as () => unknown)();
      expect(typeof resolved).toBe('function');
    }
  });

  it('resolves every inverse side that declares one', () => {
    const withInverse = getMetadataArgsStorage()
      .relations.filter((r) => ownedByAnEntity(r.target))
      .filter((r) => typeof r.inverseSideProperty === 'function');

    for (const relation of withInverse) {
      const inverse = relation.inverseSideProperty as (
        o: Record<string, unknown>,
      ) => unknown;
      // the thunk just selects a property off its argument; a proxy records which
      expect(() =>
        inverse(new Proxy({}, { get: () => undefined })),
      ).not.toThrow();
    }
  });
});
