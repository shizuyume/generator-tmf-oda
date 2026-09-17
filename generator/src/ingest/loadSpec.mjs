import SwaggerParser from '@apidevtools/swagger-parser';
import path from 'node:path';

export function detectDialect(doc) {
  if (typeof doc.swagger === 'string' && doc.swagger.startsWith('2')) return 'swagger2';
  if (typeof doc.openapi === 'string' && doc.openapi.startsWith('3')) return 'oas3';
  return 'unknown';
}

/**
 * Both dialects are supported: Swagger 2.0 (the v4 TMF corpus, 84 specs) and OAS3
 * (the v5 corpus). Dialect differences are normalised in ir/buildIR.mjs, not here.
 *
 * Bundle (not dereference) so internal $ref names survive - see schemaUtils.
 * swagger-parser also validates structure, so a malformed spec fails here rather
 * than producing half an IR.
 */
export async function loadSpec(specPath) {
  const abs = path.resolve(specPath);
  const doc = await SwaggerParser.bundle(abs);
  const dialect = detectDialect(doc);
  if (dialect === 'unknown') {
    throw new Error(`Cannot detect spec dialect (no 'openapi' or 'swagger' key): ${abs}`);
  }
  return { doc, dialect, specPath: abs };
}
