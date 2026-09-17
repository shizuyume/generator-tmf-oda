// resourceModel.mjs — walks one FEIR `view: list` page into the shape every
// emit/mcs-common/*.mjs module needs (resource naming, resolved add/edit field lists,
// payload specs, relation fields found anywhere in the field tree).
import { resourceNameFromApiPath, toPascalCase, toCamelCase, toKebabCase } from './naming.mjs';

/** `fields: [{reuse: 'add'}]` -> the add form's own field list (schema-guaranteed shape). */
function resolveFields(fields, addFields) {
  if (fields.length === 1 && fields[0].reuse === 'add') return addFields;
  return fields;
}

/** Recursively collect every field.type==='typeahead' node that carries a `relation` config. */
function collectRelationFields(fields, out = []) {
  for (const f of fields ?? []) {
    if (f.relation) out.push(f);
    if (f.type === 'repeatable-group' && Array.isArray(f.itemFields)) collectRelationFields(f.itemFields, out);
  }
  return out;
}

export function buildResourceModel(page) {
  if (page.view !== 'list') {
    throw new Error(`resourceModel: page "${page.id}" is not view:list - mcs-common only models list pages as resources`);
  }
  const resourceName = resourceNameFromApiPath(page.list.api);
  const ResourceName = toPascalCase(resourceName);
  const resourceCamel = toCamelCase(resourceName);
  const resourceKebab = toKebabCase(resourceName);

  const addForm = page.forms?.add ?? null;
  const editForm = page.forms?.edit ?? null;
  const addFields = addForm?.fields ?? [];
  const editFields = editForm ? resolveFields(editForm.fields ?? [], addFields) : [];

  const relationFields = collectRelationFields(addFields);

  return {
    pageId: page.id,
    path: page.path,
    title: page.title,
    resourceName,      // wire/api segment, e.g. "partyRevSharingAlgorithm"
    ResourceName,       // PascalCase type/component name, e.g. "PartyRevSharingAlgorithm"
    resourceCamel,       // camelCase fn/var prefix, e.g. "partyRevSharingAlgorithm"
    resourceKebab,       // kebab-case folder/file segment
    endpoint: `/${resourceName}`,
    list: page.list,
    addForm,
    editForm,
    addFields,
    editFields,
    detail: page.detail ?? null,
    relationFields,
  };
}

export function listPages(feir) {
  return (feir.pages ?? []).filter((p) => p.view === 'list');
}
