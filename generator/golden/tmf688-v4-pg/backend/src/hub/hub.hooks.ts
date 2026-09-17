// NOT managed by tmfgen. Created once if missing; never overwritten.
//
// Put domain logic here - cross-resource reference resolution, business-rule
// validation, response decoration. The generated service calls these at fixed
// points. Returning undefined leaves the input untouched.

import { CreateHubDto, UpdateHubDto } from './dto';

/** Runs before the entity is built. Return a modified payload, or undefined. */
export async function beforeCreate(
  dto: Record<string, any> | CreateHubDto,
): Promise<Record<string, any> | undefined> {
  return undefined;
}

/** Runs before the update transaction. Return a modified payload, or undefined. */
export async function beforeUpdate(
  id: string,
  dto: Record<string, any> | UpdateHubDto,
): Promise<Record<string, any> | undefined> {
  return undefined;
}

/** Runs after a single resource is mapped. Return a modified response, or undefined. */
export async function afterFindOne(
  response: Record<string, any>,
  entity: unknown,
): Promise<Record<string, any> | undefined> {
  return undefined;
}
