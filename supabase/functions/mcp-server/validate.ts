/**
 * Minimal JSON Schema checker for tool arguments.
 *
 * Tool schemas are published verbatim in `tools/list`, so they are validated
 * here too rather than by hand-rolled per-tool checks: agents get the same
 * answer from the schema they read and the error they receive. Only the subset
 * the tool schemas use is supported (type, required, enum, properties,
 * additionalProperties, items, minimum/maximum, minLength).
 */
import { validationError } from './errors.ts';

type Schema = Record<string, unknown>;

function typeOf(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (Number.isInteger(value)) return 'integer';
  return typeof value;
}

function matchesType(value: unknown, expected: string): boolean {
  const actual = typeOf(value);
  if (expected === 'number') return actual === 'number' || actual === 'integer';
  if (expected === 'integer') return actual === 'integer';
  return actual === expected;
}

function check(value: unknown, schema: Schema, path: string, errors: string[]): void {
  const expectedTypes = Array.isArray(schema.type)
    ? schema.type as string[]
    : typeof schema.type === 'string'
      ? [schema.type]
      : [];

  if (expectedTypes.length && !expectedTypes.some((type) => matchesType(value, type))) {
    errors.push(`${path} must be ${expectedTypes.join(' or ')} (received ${typeOf(value)})`);
    return;
  }

  if (Array.isArray(schema.enum) && !schema.enum.includes(value as never)) {
    errors.push(`${path} must be one of: ${(schema.enum as unknown[]).join(', ')}`);
    return;
  }

  if (typeof value === 'number') {
    if (typeof schema.minimum === 'number' && value < schema.minimum) {
      errors.push(`${path} must be >= ${schema.minimum}`);
    }
    if (typeof schema.maximum === 'number' && value > schema.maximum) {
      errors.push(`${path} must be <= ${schema.maximum}`);
    }
  }

  if (typeof value === 'string' && typeof schema.minLength === 'number' && value.length < schema.minLength) {
    errors.push(`${path} must be at least ${schema.minLength} characters`);
  }

  if (Array.isArray(value)) {
    if (typeof schema.minItems === 'number' && value.length < schema.minItems) {
      errors.push(`${path} must contain at least ${schema.minItems} item(s)`);
    }
    const itemSchema = schema.items as Schema | undefined;
    if (itemSchema) {
      value.forEach((item, index) => check(item, itemSchema, `${path}[${index}]`, errors));
    }
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const properties = (schema.properties ?? {}) as Record<string, Schema>;
    const record = value as Record<string, unknown>;

    for (const required of (schema.required ?? []) as string[]) {
      if (record[required] === undefined || record[required] === null) {
        errors.push(`${path === '' ? required : `${path}.${required}`} is required`);
      }
    }

    if (schema.additionalProperties === false) {
      for (const key of Object.keys(record)) {
        if (!(key in properties)) {
          errors.push(`${path === '' ? key : `${path}.${key}`} is not a recognised argument`);
        }
      }
    }

    for (const [key, propertySchema] of Object.entries(properties)) {
      if (record[key] === undefined || record[key] === null) continue;
      check(record[key], propertySchema, path === '' ? key : `${path}.${key}`, errors);
    }
  }
}

/** Throws a -32006 error listing every problem found in `args`. */
export function validateArgs(toolName: string, schema: Schema, args: Record<string, unknown>): void {
  const errors: string[] = [];
  check(args, schema, '', errors);
  if (errors.length) {
    throw validationError(`Invalid arguments for ${toolName}: ${errors.join('; ')}`, { errors });
  }
}
