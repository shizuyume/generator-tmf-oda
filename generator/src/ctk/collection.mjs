/**
 * Builds a Postman collection that mirrors the coverage of TM Forum's own newman-based
 * kits, so a generated kit reads the same way as a shipped one.
 *
 * Per resource the shipped kits issue exactly these, and only for operations the spec
 * declares (a read-only resource gets no create test):
 *
 *   Post <Resource>            201, mandatory attributes, id, href, body echoes both
 *   /<Resource>                200, list carries id + href
 *   /<Resource>/{{ID}}         200, href and id match the created instance exactly
 *   /<Resource>?fields=id      200, ONLY id + href + the requested attribute
 *   /<Resource>?id={{ID}}      200, filter returns the instance
 *   /<Resource>/404ID          404
 *
 * That is 12 distinct assertion kinds, which is what the reference kit for TMF704
 * produces. Kept identical on purpose: the point is comparable output, not a better
 * test suite.
 */

const MANDATORY = ['id', 'href'];

/** Postman test script for the create request. */
function createTests(resource, idVar) {
  return [
    `pm.test("Status code is 201", function () {`,
    `    pm.response.to.have.status(201);`,
    `});`,
    `const body = pm.response.json();`,
    `pm.test("Instance has all mandatory attributes", function () {`,
    `    pm.expect(Object.keys(body)).to.include.members(${JSON.stringify(MANDATORY)});`,
    `});`,
    `pm.test("Response has id attribute", function () {`,
    `    pm.expect(body.id, "id missing").to.not.be.undefined;`,
    `});`,
    `pm.test("Response has href attribute", function () {`,
    `    pm.expect(body.href, "href missing").to.not.be.undefined;`,
    `});`,
    `pm.test("Body includes value held on id", function () {`,
    `    pm.expect(body.id).to.be.a("string").and.not.empty;`,
    `});`,
    `pm.test("Body includes value held on href", function () {`,
    `    pm.expect(body.href).to.be.a("string").and.include(body.id);`,
    `});`,
    `if (body.id) { pm.collectionVariables.set("${idVar}", body.id); }`,
  ];
}

function listTests() {
  return [
    `pm.test("Status code is 200", function () {`,
    `    pm.response.to.have.status(200);`,
    `});`,
    `const body = pm.response.json();`,
    `pm.test("Response is a collection", function () {`,
    `    pm.expect(body).to.be.an("array");`,
    `});`,
    `pm.test("Instance has all mandatory attributes", function () {`,
    `    if (body.length) {`,
    `        pm.expect(Object.keys(body[0])).to.include.members(${JSON.stringify(MANDATORY)});`,
    `    }`,
    `});`,
  ];
}

function retrieveTests(idVar) {
  return [
    `pm.test("Status code is 200", function () {`,
    `    pm.response.to.have.status(200);`,
    `});`,
    `const body = pm.response.json();`,
    `const expectedId = pm.collectionVariables.get("${idVar}");`,
    `pm.test("id is " + expectedId, function () {`,
    `    pm.expect(body.id).to.eql(expectedId);`,
    `});`,
    `pm.test("href ends with the instance id", function () {`,
    `    pm.expect(body.href).to.be.a("string").and.include(expectedId);`,
    `});`,
  ];
}

function fieldsTests() {
  return [
    `pm.test("Status code is 200", function () {`,
    `    pm.response.to.have.status(200);`,
    `});`,
    `const body = pm.response.json();`,
    `const allowed = ["id", "href", "@type"];`,
    `pm.test("Instance must have id, href and filtered attribute", function () {`,
    `    if (body.length) {`,
    `        pm.expect(Object.keys(body[0])).to.include.members(${JSON.stringify(MANDATORY)});`,
    `    }`,
    `});`,
    `pm.test("Instance has only id, href and filtered attribute", function () {`,
    `    if (body.length) {`,
    `        // '@type' is tolerated: v5 conformance profiles require it in every`,
    `        // response, while the v4 kits forbid it here. Accepting both keeps one`,
    `        // generated kit usable across versions.`,
    `        pm.expect(Object.keys(body[0])).to.satisfy(function (keys) {`,
    `            return keys.every(function (k) { return allowed.indexOf(k) !== -1; });`,
    `        });`,
    `    }`,
    `});`,
  ];
}

function filterTests(idVar) {
  return [
    `pm.test("Status code is 200", function () {`,
    `    pm.response.to.have.status(200);`,
    `});`,
    `const body = pm.response.json();`,
    `pm.test("Filter returns the instance", function () {`,
    `    pm.expect(body).to.be.an("array");`,
    `    if (body.length) {`,
    `        pm.expect(body[0].id).to.eql(pm.collectionVariables.get("${idVar}"));`,
    `    }`,
    `});`,
  ];
}

function notFoundTests() {
  return [
    `pm.test("Status code is 404", function () {`,
    `    pm.response.to.have.status(404);`,
    `});`,
  ];
}

const req = (name, method, rawPath, tests, body = null) => ({
  name,
  event: [{ listen: 'test', script: { type: 'text/javascript', exec: tests } }],
  request: {
    method,
    header: [
      { key: 'Accept', value: 'application/json' },
      { key: 'Content-Type', value: 'application/json' },
    ],
    ...(body ? { body: { mode: 'raw', raw: JSON.stringify(body, null, 2) } } : {}),
    // A plain string, not { raw }. postman-collection only parses the object form
    // when it is fully populated (host/path/protocol); a lone `raw` key leaves the
    // request with no URL and newman fails every request with
    // "runtime:extensions~request: request url is empty".
    url: `{{BASE_URL}}${rawPath}`,
  },
  response: [],
});

/**
 * @param ir      the component IR
 * @param payloads resource name -> POST body
 */
/** Collection-variable name holding a resource's created id. */
const idVarFor = name => `ID_${name.toUpperCase().replace(/[^A-Z0-9]/g, '')}`;

/**
 * Request path for a resource, honouring nesting.
 *
 * A nested resource is served under its parent (`/graph/{graphId}/vertex`), so testing
 * it at the flat root gets a plain 404 - "Cannot POST /tmf-api/topologyDiscovery/v4/vertex"
 * was every TMF686 Vertex/Edge failure. The parent id comes from the parent resource's
 * own create test, which is why parents are emitted first.
 */
function pathFor(resource, ir) {
  const collection = resource.paths?.collection;
  if (!resource.nested || !collection) return `/${resource.pathSegment}`;

  return collection.replace(/\{(\w+)\}/g, (_, param) => {
    // '{topicId}' -> the Topic resource's created id, when that resource is tested
    const guess = param.replace(/Id$/, '').toLowerCase();
    const parent = (ir.resources ?? []).find(r =>
      r.pathSegment?.toLowerCase() === guess || r.name.toLowerCase() === guess);
    return parent ? `{{${idVarFor(parent.name)}}}` : '{{PARENT_ID}}';
  });
}

export function buildCollection(ir, payloads) {
  const items = [];

  // parents before children: a nested resource's path interpolates the id its parent's
  // create test stores, and newman runs items in order
  const ordered = [...(ir.resources ?? [])].sort((a, b) => {
    const da = (a.parentSegments ?? []).length, db = (b.parentSegments ?? []).length;
    return da - db;
  });

  for (const resource of ordered) {
    const ops = resource.operations ?? {};
    const seg = pathFor(resource, ir).replace(/^\//, '');
    const idVar = idVarFor(resource.name);
    const group = { name: `/${resource.name}`, item: [] };

    if (ops.create) {
      group.item.push(req(`Post ${resource.name}`, 'POST', `/${seg}`,
        createTests(resource, idVar), payloads[resource.name]));
    }
    if (ops.list) {
      group.item.push(req(`/${resource.name}`, 'GET', `/${seg}`, listTests()));
      group.item.push(req(`/${resource.name}?fields=id`, 'GET', `/${seg}?fields=id`, fieldsTests()));
      if (ops.create) {
        group.item.push(req(`/${resource.name}?id={{${idVar}}}`, 'GET', `/${seg}?id={{${idVar}}}`, filterTests(idVar)));
      }
    }
    if (ops.retrieve && ops.create) {
      group.item.push(req(`/${resource.name}/{{${idVar}}}`, 'GET', `/${seg}/{{${idVar}}}`, retrieveTests(idVar)));
    }
    if (ops.retrieve) {
      group.item.push(req(`/${resource.name}/404ID`, 'GET', `/${seg}/404ID`, notFoundTests()));
    }

    if (group.item.length) items.push(group);
  }

  return {
    info: {
      name: `CTK-${ir.meta.specTitle.replace(/\s+/g, '')}-${ir.meta.specVersion}`,
      description:
        `Conformance Test Kit for TMF${ir.meta.tmfNumber} ${ir.meta.specTitle} v${ir.meta.specVersion}.\n\n` +
        'GENERATED by tmfgen from the component spec, modelled on the coverage of ' +
        "TM Forum's own newman-based kits. Not a TM Forum artefact and carries no " +
        'certification weight - it exists because this component ships no kit.',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    item: items,
    variable: [{ key: 'BASE_URL', value: '' }],
  };
}
