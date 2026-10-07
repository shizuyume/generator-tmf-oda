/**
 * List filtering (TMF630): the whitelist a resource can be filtered on, and the AST both
 * filter styles parse into.
 *
 *   attribute style   ?name=Split&lastUpdate.gte=2026-09-01T00:00:00Z&policy.name=Roaming
 *   JSONPath style    ?filter=$[?(@.state=='raised' && @.perceivedSeverity!='minor')]
 *                     ?filter=policy[?(@.name=='Roaming Settlement')]
 *                     ?filter=conditionVariable[?(@.policyCondition.id=='pcond-002' && @.value=='500')]
 *
 * Every scope is one condition on the resource, all scopes are ANDed. The conditions inside an
 * array scope `[?( … )]` hold for ONE element of that array (not each for some element).
 */

/** A filterable attribute: the wire name maps to an entity property of this type. */
export interface FilterAttr {
  /** Entity property (TypeORM resolves it to the column). */
  property: string;
  type: 'string' | 'number' | 'boolean' | 'date';
}

/** A single reference held by the entity (many-to-one), filterable through its attributes. */
export interface FilterRef {
  relation: string;
  attrs: Record<string, FilterAttr>;
}

export interface FilterNode {
  /** Entity class the node's rows come from. */
  entity: Function;
  attrs: Record<string, FilterAttr>;
  refs: Record<string, FilterRef>;
}

/** Generated per resource from the IR (src/<resource>/<resource>.filter.ts). */
export interface FilterSchema extends FilterNode {
  /** Embedded lists (one-to-many children), by wire name. */
  arrays: Record<string, FilterNode>;
  /**
   * Server-kept audit timestamps (createdDate, lastUpdate) that the spec does not declare:
   * filterable at the top level (`$`) and sortable, like the resource's own attributes.
   */
  timestamps: Record<string, FilterAttr>;
  /** Query keys that are not filters on this resource (e.g. the parent id of a nested route). */
  reserved: string[];
}

export type FilterOp = '==' | '!=' | '<' | '<=' | '>' | '>=' | 'contains';
export type FilterValue = string | number | boolean | null;

export interface FilterCondition {
  kind: 'cond';
  /** ['name'] or ['policyCondition', 'id'] — relative to the scope. */
  path: string[];
  op: FilterOp;
  value: FilterValue;
  /** contains only: case-insensitive (`/…/i`). */
  ignoreCase?: boolean;
}

export type FilterExpr =
  | FilterCondition
  | { kind: 'and'; items: FilterExpr[] }
  | { kind: 'or'; items: FilterExpr[] }
  | { kind: 'not'; item: FilterExpr };

export interface FilterScope {
  /** null = the resource itself (`$`), else an embedded list. */
  array: string | null;
  expr: FilterExpr;
}

export interface SortKey {
  attr: string;
  direction: 'ASC' | 'DESC';
}
