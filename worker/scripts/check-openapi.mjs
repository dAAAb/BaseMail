#!/usr/bin/env node
/**
 * check-openapi.mjs — structural lint for the BaseMail OpenAPI document.
 *
 * Usage:
 *   node scripts/check-openapi.mjs <path-to-spec.json | https://.../openapi.json>
 *
 * Asserts (function-calling / "Is Agentic" readiness):
 *   - every operation has a unique operationId, summary, description, non-empty tags
 *   - every operation has at least one 2xx response with an application/json schema
 *     (2xx responses with a non-JSON media type, e.g. message/rfc822, are allowed as long
 *      as one JSON 2xx exists OR the operation is explicitly marked x-binary-response)
 *   - every 4xx/5xx response has a schema (any media type)
 *   - components.schemas.Error exists
 *   - info.x-versioning exists (top-level x-versioning is also accepted)
 *   - every $ref resolves
 * Exits 1 with a readable list of violations.
 */

const arg = process.argv[2];
if (!arg) {
  console.error('usage: node scripts/check-openapi.mjs <spec.json | https://host/api/openapi.json>');
  process.exit(2);
}

async function load(src) {
  if (/^https?:\/\//.test(src)) {
    const res = await fetch(src, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${src}`);
    return await res.json();
  }
  const { readFile } = await import('node:fs/promises');
  return JSON.parse(await readFile(src, 'utf8'));
}

const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];
const violations = [];
const v = (msg) => violations.push(msg);

function resolveRef(spec, $ref) {
  if (typeof $ref !== 'string' || !$ref.startsWith('#/')) return undefined;
  return $ref.slice(2).split('/').reduce((o, k) => (o == null ? undefined : o[k.replace(/~1/g, '/').replace(/~0/g, '~')]), spec);
}

function walkRefs(spec, node, path) {
  if (Array.isArray(node)) return node.forEach((n, i) => walkRefs(spec, n, `${path}[${i}]`));
  if (node && typeof node === 'object') {
    if (typeof node.$ref === 'string' && resolveRef(spec, node.$ref) === undefined) v(`${path}: unresolved $ref ${node.$ref}`);
    for (const [k, val] of Object.entries(node)) walkRefs(spec, val, `${path}.${k}`);
  }
}

const spec = await load(arg);

if (spec.openapi !== '3.1.0') v(`openapi version is ${spec.openapi}, expected 3.1.0`);
if (!spec.components?.schemas?.Error) v('components.schemas.Error is missing');
if (!spec.info?.['x-versioning'] && !spec['x-versioning']) v('info.x-versioning is missing');
if (!spec.info?.version) v('info.version is missing');
if (!Array.isArray(spec.servers) || spec.servers.length === 0) v('servers[] is empty');

const seenIds = new Map();
let pathCount = 0;
let opCount = 0;

for (const [p, item] of Object.entries(spec.paths ?? {})) {
  pathCount++;
  for (const method of HTTP_METHODS) {
    const op = item?.[method];
    if (!op) continue;
    opCount++;
    const where = `${method.toUpperCase()} ${p}`;

    if (!op.operationId) v(`${where}: missing operationId`);
    else {
      if (!/^[a-z][A-Za-z0-9]*$/.test(op.operationId)) v(`${where}: operationId "${op.operationId}" is not lowerCamelCase`);
      if (seenIds.has(op.operationId)) v(`${where}: duplicate operationId "${op.operationId}" (also ${seenIds.get(op.operationId)})`);
      seenIds.set(op.operationId, where);
    }
    if (!op.summary) v(`${where}: missing summary`);
    if (!op.description) v(`${where}: missing description`);
    if (!Array.isArray(op.tags) || op.tags.length === 0) v(`${where}: missing tags`);
    for (const t of op.tags ?? []) {
      if (!(spec.tags ?? []).some((tag) => tag.name === t)) v(`${where}: tag "${t}" not declared in top-level tags[]`);
    }

    for (const prm of op.parameters ?? []) {
      const param = prm.$ref ? resolveRef(spec, prm.$ref) : prm;
      if (!param?.schema) v(`${where}: parameter "${param?.name}" has no schema`);
      if (param?.in === 'path' && param.required !== true) v(`${where}: path parameter "${param.name}" must be required`);
    }
    // every {placeholder} in the path must be declared
    for (const m of p.matchAll(/\{([^}]+)\}/g)) {
      const declared = [...(op.parameters ?? []), ...(item.parameters ?? [])].map((x) => (x.$ref ? resolveRef(spec, x.$ref) : x)).some((x) => x?.in === 'path' && x.name === m[1]);
      if (!declared) v(`${where}: path parameter {${m[1]}} not declared`);
    }

    const responses = op.responses ?? {};
    if (Object.keys(responses).length === 0) v(`${where}: no responses`);
    let hasJson2xx = false;
    for (const [status, rawRes] of Object.entries(responses)) {
      const res = rawRes?.$ref ? resolveRef(spec, rawRes.$ref) : rawRes;
      const content = res?.content ?? {};
      const code = Number(status);
      if (status === 'default' || (code >= 200 && code < 300)) {
        if (content['application/json']?.schema) hasJson2xx = true;
        else if (Object.keys(content).length === 0) v(`${where}: ${status} response has no content/schema`);
      } else if (code >= 400) {
        const hasSchema = Object.values(content).some((c) => c && c.schema);
        if (!hasSchema) v(`${where}: ${status} response has no schema`);
      }
    }
    if (!hasJson2xx && !op['x-binary-response']) v(`${where}: no 2xx response with application/json schema`);
  }
}

walkRefs(spec, spec, '$');

console.log(`paths: ${pathCount}, operations: ${opCount}, unique operationIds: ${seenIds.size}`);
if (violations.length) {
  console.error(`\n${violations.length} violation(s):`);
  for (const m of violations) console.error(`  - ${m}`);
  process.exit(1);
}
console.log('OK — OpenAPI document passes all agentic-readiness checks.');
