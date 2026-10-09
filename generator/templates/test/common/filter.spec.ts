import { BadRequestException } from '@nestjs/common';
import {
  FILTER_LIMITS,
  parseAttributeParam,
  parseJsonPathFilter,
  parseSort,
} from '../../src/common/filter/filter-parser';
import { applyQueryFilters } from '../../src/common/filter/filter-typeorm';
import type { FilterSchema } from '../../src/common/filter/filter.types';

type AnyRec = Record<string, any>;

class Root {}
class Item {}

const SCHEMA: FilterSchema = {
  entity: Root,
  attrs: {
    id: { property: 'id', type: 'string' },
    name: { property: 'name', type: 'string' },
    description: { property: 'description', type: 'string' },
    count: { property: 'count', type: 'number' },
    active: { property: 'active', type: 'boolean' },
    validFrom: { property: 'validFrom', type: 'date' },
    '@type': { property: 'atType', type: 'string' },
  },
  refs: {
    category: { relation: 'category', attrs: { id: { property: 'refId', type: 'string' } } },
  },
  arrays: {
    item: {
      entity: Item,
      attrs: {
        name: { property: 'name', type: 'string' },
        qty: { property: 'qty', type: 'number' },
      },
      refs: {
        product: { relation: 'product', attrs: { id: { property: 'refId', type: 'string' } } },
      },
    },
  },
  timestamps: { createdDate: { property: 'createdDate', type: 'date' } },
  reserved: ['parentId'],
};

/** Records what the translator builds; a subquery renders as its calls + WHERE. */
function fakeQb(type = 'sqlite'): AnyRec {
  let params: AnyRec = { existing: 1 };
  const qb: AnyRec = {
    connection: { options: { type } },
    wheres: [] as string[],
    orders: [] as [string, string][],
    andWhere: jest.fn((sql: string) => {
      qb.wheres.push(sql);
      return qb;
    }),
    addOrderBy: jest.fn((col: string, dir: string) => {
      qb.orders.push([col, dir]);
      return qb;
    }),
    subQuery: jest.fn(() => {
      const calls: string[] = [];
      let where = '';
      const sub: AnyRec = {};
      const rec = (call: string) => {
        calls.push(call);
        return sub;
      };
      sub.from = (e: { name: string }, a: string) => rec(`from ${e.name} ${a}`);
      sub.select = (sel: string) => rec(`select ${sel}`);
      sub.innerJoin = (r: string, a: string) => rec(`inner ${r} ${a}`);
      sub.leftJoin = (r: string, a: string) => rec(`left ${r} ${a}`);
      sub.where = (sql: string) => {
        where = sql;
        return sub;
      };
      sub.getQuery = () => `(${calls.join('; ')} WHERE ${where})`;
      return sub;
    }),
    getParameters: () => ({ ...params }),
    setParameters: (p: AnyRec) => {
      params = p;
      return qb;
    },
    params: () => params,
  };
  return qb;
}

function run(query: AnyRec, type?: string): AnyRec {
  const qb = fakeQb(type);
  applyQueryFilters(qb as never, query, SCHEMA);
  return qb;
}

function refused(fn: () => unknown, part: string): void {
  let err: unknown;
  try {
    fn();
  } catch (e) {
    err = e;
  }
  expect(err).toBeInstanceOf(BadRequestException);
  expect((err as BadRequestException).message).toContain(part);
}

describe('parseJsonPathFilter', () => {
  it('parses a top-level scope with the shorthands', () => {
    expect(parseJsonPathFilter("$[?(@.state=='raised')]")).toEqual({
      array: null,
      expr: { kind: 'cond', path: ['state'], op: '==', value: 'raised' },
    });
    // `@name` and a single `=` are accepted too
    expect(parseJsonPathFilter('$[?(@state="raised")]').expr).toEqual({
      kind: 'cond',
      path: ['state'],
      op: '==',
      value: 'raised',
    });
  });

  it('parses an array scope, ref paths and @-attributes', () => {
    const scope = parseJsonPathFilter(
      "relatedParty[?(@.name=='mobile' && @.party.id=='1' && @.@type=='X')]",
    );
    expect(scope.array).toBe('relatedParty');
    expect(scope.expr).toMatchObject({
      kind: 'and',
      items: [{ path: ['name'] }, { path: ['party', 'id'] }, { path: ['@type'] }],
    });
  });

  it('binds && tighter than || and honours ! and ( )', () => {
    expect(parseJsonPathFilter('$[?(@.a==1 || @.b==2 && @.c==3)]').expr).toMatchObject({
      kind: 'or',
      items: [{ path: ['a'] }, { kind: 'and', items: [{ path: ['b'] }, { path: ['c'] }] }],
    });
    expect(parseJsonPathFilter('$[?(!(@.a==1 || @.b==2))]').expr).toMatchObject({
      kind: 'not',
      item: { kind: 'or' },
    });
  });

  it('reads every value kind and operator', () => {
    const items = (src: string) => (parseJsonPathFilter(src).expr as AnyRec).items;
    expect(
      items("$[?(@.a<-1.5 && @.b<=2e3 && @.c>0 && @.d>=1 && @.e!=true && @.f==false && @.g==null && @.h=='it\\'s')]").map(
        (c: AnyRec) => [c.op, c.value],
      ),
    ).toEqual([
      ['<', -1.5],
      ['<=', 2000],
      ['>', 0],
      ['>=', 1],
      ['!=', true],
      ['==', false],
      ['==', null],
      ['==', "it's"],
    ]);
  });

  it('reads =~ as a literal contains, with or without i', () => {
    expect(parseJsonPathFilter('$[?(@.name=~/Gold/i)]').expr).toEqual({
      kind: 'cond',
      path: ['name'],
      op: 'contains',
      value: 'Gold',
      ignoreCase: true,
    });
    expect(parseJsonPathFilter('$[?(@.v=~/1\\.5\\/2\\\\/)]').expr).toMatchObject({
      value: '1.5/2\\',
      ignoreCase: false,
    });
  });

  it.each([
    ["$[?(@.a=='x)]", 'unterminated string'],
    ['$[?(@.a=~/x)]', 'unterminated /'],
    ['$[?(@.a==/x/)]', 'unexpected "/"'],
    ['$[?(@.a=~/a.*/)]', 'escape "."'],
    ['$[?(@.a=~/a/g)]', 'only i'],
    ["$[?(@.a=~'x')]", '=~ takes /text/'],
    ['$[?(@.a==b)]', 'expected a value'],
    ['$[?(@.a==))]', 'expected a value'],
    ['$[?(@.a==', 'missing value'],
    ['$[?(@.a)]', 'expected a comparison'],
    ['$[?(@.)]', 'expected an attribute name'],
    ['$[?(@.a<null)]', 'null compares'],
    ['$[?(@.a==1)]x', 'unexpected text'],
    ['$[?(@.a==1)', 'expected "]"'],
    ['$[?(@.a#1)]', 'unexpected "#"'],
    [`$[?(@.a=='${'x'.repeat(FILTER_LIMITS.length)}')]`, 'longer than'],
    [`$[?(${'!'.repeat(FILTER_LIMITS.depth + 1)}@.a==1)]`, 'nesting deeper'],
    [
      `$[?(${Array.from({ length: FILTER_LIMITS.conditions + 1 }, () => '@.a==1').join(' || ')})]`,
      `more than ${FILTER_LIMITS.conditions} conditions`,
    ],
  ])('refuses %s', (src, part) => {
    refused(() => parseJsonPathFilter(src), part);
  });
});

describe('parseAttributeParam', () => {
  it('splits the path and the operator suffix', () => {
    expect(parseAttributeParam('lastUpdate.gte', 'x')).toEqual([
      { kind: 'cond', path: ['lastUpdate'], op: '>=', value: 'x' },
    ]);
    expect(parseAttributeParam('item.name', ['a', 'b']).map((c) => [c.path, c.op, c.value])).toEqual([
      [['item', 'name'], '==', 'a'],
      [['item', 'name'], '==', 'b'],
    ]);
    expect(['eq', 'ne', 'gt', 'lt', 'lte'].map((o) => parseAttributeParam(`a.${o}`, '1')[0].op)).toEqual([
      '==',
      '!=',
      '>',
      '<',
      '<=',
    ]);
    expect(parseAttributeParam('@type', 'X')[0].path).toEqual(['@type']);
  });

  it('refuses a key that is not an attribute path', () => {
    refused(() => parseAttributeParam('a-b', '1'), 'not an attribute path');
  });
});

describe('parseSort', () => {
  it('reads -a,+b and a:desc, across repeated params', () => {
    expect(parseSort(['-a, +b', 'c:desc,d'])).toEqual([
      { attr: 'a', direction: 'DESC' },
      { attr: 'b', direction: 'ASC' },
      { attr: 'c', direction: 'DESC' },
      { attr: 'd', direction: 'ASC' },
    ]);
    expect(parseSort(undefined)).toEqual([]);
  });
});

describe('applyQueryFilters', () => {
  it('adds nothing for an empty query and keeps existing parameters', () => {
    const qb = run({ offset: 0, limit: 20, fields: 'id', parentId: 'p', name: '', filter: undefined });
    expect(qb.wheres).toEqual([]);
    expect(qb.orders).toEqual([]);
    expect(qb.params()).toEqual({ existing: 1 });
  });

  it('applies the house filters name and q as escaped, case-insensitive contains', () => {
    const qb = run({ name: 'A_b', q: '50%' });
    expect(qb.wheres).toEqual([
      "LOWER(e.name) LIKE :flt1 ESCAPE '\\'",
      "(LOWER(e.name) LIKE :flt2 ESCAPE '\\' OR LOWER(e.description) LIKE :flt3 ESCAPE '\\')",
    ]);
    expect(qb.params()).toMatchObject({ flt1: '%a\\_b%', flt2: '%50\\%%', flt3: '%50\\%%' });
  });

  it('turns a top-level scope into an id subquery with bound parameters', () => {
    const qb = run({ filter: "$[?(@.@type=='X' && @.category.id=='c1')]" });
    expect(qb.wheres).toEqual([
      'e.id IN (from Root fs0; select fs0.id; left fs0.category fs0_category WHERE (fs0.atType = :flt1 AND fs0_category.refId = :flt2))',
    ]);
    expect(qb.params()).toEqual({ existing: 1, flt1: 'X', flt2: 'c1' });
  });

  it('matches one array element for every condition of an array scope', () => {
    const qb = run({ filter: ["item[?(@.name=='a' && @.product.id=='p1')]", '$[?(@.count>2)]'] });
    expect(qb.wheres[0]).toBe(
      'e.id IN (from Item fs0; inner fs0.owner fs0_owner; select fs0_owner.id; left fs0.product fs0_product WHERE (fs0.name = :flt1 AND fs0_product.refId = :flt2))',
    );
    expect(qb.wheres[1]).toContain('WHERE fs1.count > :flt3');
    expect(qb.params()).toMatchObject({ flt3: 2 });
  });

  it('compiles null, !=, ! and ||', () => {
    const qb = run({ filter: "$[?(!(@.description==null) || @.description!=null || @.name!='x')]" });
    expect(qb.wheres[0]).toContain(
      'WHERE (NOT (fs0.description IS NULL) OR fs0.description IS NOT NULL OR (fs0.name <> :flt1 OR fs0.name IS NULL))',
    );
  });

  it('coerces values to the attribute type, per driver for dates', () => {
    const sqlite = run({ filter: "$[?(@.count=='3' && @.active=='true' && @.validFrom>='2026-09-01T07:00:00+07:00')]" });
    expect(sqlite.params()).toMatchObject({ flt1: 3, flt2: true, flt3: '2026-09-01 00:00:00.000' });
    const pg = run({ filter: '$[?(@.active==false && @.validFrom<"2026-09-01")]' }, 'postgres');
    expect(pg.params().flt1).toBe(false);
    expect(pg.params().flt2).toEqual(new Date('2026-09-01'));
  });

  it('runs a case-sensitive contains as a position search on each driver', () => {
    expect(run({ filter: '$[?(@.name=~/Ab/)]' }).wheres[0]).toContain('instr(fs0.name, :flt1) > 0');
    expect(run({ filter: '$[?(@.name=~/Ab/)]' }, 'postgres').wheres[0]).toContain('strpos(fs0.name, :flt1) > 0');
    const ci = run({ filter: '$[?(@.name=~/A%b/i)]' });
    expect(ci.wheres[0]).toContain("LOWER(fs0.name) LIKE :flt1 ESCAPE '\\'");
    expect(ci.params().flt1).toBe('%a\\%b%');
  });

  it('filters on server timestamps at the top level only', () => {
    const qb = run({ 'createdDate.gte': '2026-09-01T00:00:00Z' });
    expect(qb.wheres[0]).toContain('WHERE fs0.createdDate >= :flt1');
    refused(() => run({ filter: "item[?(@.createdDate>'2026')]" }), 'unknown attribute "createdDate" in item');
  });

  it('reads attribute-style keys: operators, any-of lists and one element per array', () => {
    const qb = run({
      'count.gte': '2',
      id: 'a,b',
      description: ['x', 'y'],
      'item.name': 'n',
      'item.qty.lt': '5',
      'category.id': 'c1',
    });
    expect(qb.wheres).toHaveLength(2);
    expect(qb.wheres[0]).toContain(
      'WHERE (fs0.count >= :flt1 AND (fs0.id = :flt2 OR fs0.id = :flt3) AND fs0.description = :flt4 AND fs0.description = :flt5 AND fs0_category.refId = :flt6)',
    );
    expect(qb.wheres[1]).toContain('inner fs1.owner fs1_owner');
    expect(qb.wheres[1]).toContain('WHERE (fs1.name = :flt7 AND fs1.qty < :flt8)');
  });

  it('sorts by attributes and server timestamps', () => {
    const qb = run({ sort: '-createdDate,@type' });
    expect(qb.orders).toEqual([
      ['e.createdDate', 'DESC'],
      ['e.atType', 'ASC'],
    ]);
  });

  it.each([
    [{ filter: "$[?(@.nope=='x')]" }, 'unknown attribute "nope" in $ (filterable: id, name, description, count, active, validFrom, @type, createdDate, category.id)'],
    [{ filter: "item[?(@.product.nope=='x')]" }, 'unknown attribute "product.nope" in item'],
    [{ filter: "party[?(@.name=='x')]" }, 'unknown list "party" (lists: item)'],
    [{ count: 'many' }, 'count expects a number'],
    [{ filter: '$[?(@.count=~/1/)]' }, 'count: =~ only applies to text'],
    [{ filter: "item[?(@.qty=='many')]" }, 'item.qty expects a number'],
    [{ filter: '$[?(@.count==true)]' }, 'count expects a number'],
    [{ filter: "$[?(@.active=='yes')]" }, 'active expects true or false'],
    [{ filter: '$[?(@.active>false)]' }, 'compare with == or != only'],
    [{ filter: "$[?(@.validFrom>'soon')]" }, 'expects an ISO 8601 date'],
    [{ filter: '$[?(@.validFrom==true)]' }, 'expects an ISO 8601 date'],
    [{ filter: { a: 'b' } }, 'filter must be text'],
    [{ filter: Array.from({ length: FILTER_LIMITS.filters + 1 }, () => '$[?(@.a==1)]') }, 'more than 10 filter='],
    [{ sort: 'name;DROP TABLE x' }, 'cannot sort by "name;DROP TABLE x" (sortable: id, name'],
  ])('refuses %j', (query, part) => {
    refused(() => run(query), part);
  });

  it('ignores attribute-style keys the resource cannot filter on, as before this module', () => {
    // extra parameters (another client's, a conformance kit's) must not fail the list
    const qb = run({ nope: 'x', 'a-b': '1', 'item.nope': 'y', 'category.nope': 'z', depth: '2', 'count.gte': '3' });
    expect(qb.wheres).toEqual(['e.id IN (from Root fs0; select fs0.id WHERE fs0.count >= :flt1)']);
    expect(qb.params()).toEqual({ existing: 1, flt1: 3 });
  });

  it('adds nothing when every attribute-style key is unknown', () => {
    const qb = run({ nope: 'x', expand: 'all' });
    expect(qb.wheres).toEqual([]);
  });

  it('reports "none" for a resource without lists', () => {
    const qb = fakeQb();
    refused(
      () => applyQueryFilters(qb as never, { filter: "x[?(@.a=='b')]" }, { ...SCHEMA, arrays: {} }),
      'unknown list "x" (lists: none)',
    );
  });

  it('skips q when the resource has neither name nor description', () => {
    const qb = fakeQb();
    applyQueryFilters(qb as never, { q: 'x' }, { ...SCHEMA, attrs: {} });
    expect(qb.wheres).toEqual([]);
  });
});
