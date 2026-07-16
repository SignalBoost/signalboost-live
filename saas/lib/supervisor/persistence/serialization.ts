import { isPlainSerializable, type SerializableValue } from '../incident-schema.ts'
import { ExecutionPersistenceError } from './errors.ts'
import { sanitizeForPersistence } from './redaction.ts'
export function canonicalTimestamp(value: unknown, path = 'timestamp'): string { if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) throw new ExecutionPersistenceError('invalid_timestamp', `${path} must be an ISO timestamp`); return new Date(value).toISOString() }
export function serializable(value: unknown, path = 'payload'): SerializableValue { const clean = sanitizeForPersistence(value); if (!isPlainSerializable(clean)) throw new ExecutionPersistenceError('non_serializable', `${path} is not serializable`); return clean }
export function serializableObject(value: unknown, path = 'payload'): Record<string, SerializableValue> { const clean = serializable(value, path); if (!clean || typeof clean !== 'object' || Array.isArray(clean)) throw new ExecutionPersistenceError('invalid_payload', `${path} must be an object`); return clean as Record<string, SerializableValue> }
