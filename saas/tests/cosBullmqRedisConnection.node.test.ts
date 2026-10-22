import assert from 'node:assert/strict'
import test from 'node:test'
import { createRedisConnection } from '../lib/cos/pipeline/queues.ts'

function withRedisEnv(value: string | undefined, run: () => void) {
  const previousCos = process.env.COS_REDIS_URL
  const previousDefault = process.env.REDIS_URL
  try {
    delete process.env.REDIS_URL
    if (value === undefined) delete process.env.COS_REDIS_URL
    else process.env.COS_REDIS_URL = value
    run()
  } finally {
    if (previousCos === undefined) delete process.env.COS_REDIS_URL
    else process.env.COS_REDIS_URL = previousCos
    if (previousDefault === undefined) delete process.env.REDIS_URL
    else process.env.REDIS_URL = previousDefault
  }
}

test('COS BullMQ connection resolves remote Redis URL and credentials', () => {
  withRedisEnv('redis://user:p%40ss@redis.example.com:6380/3', () => {
    assert.deepEqual(createRedisConnection(), {
      host: 'redis.example.com', port: 6380, db: 3, username: 'user', password: 'p@ss',
    })
  })
})

test('COS BullMQ connection enables TLS for rediss URLs', () => {
  withRedisEnv('rediss://redis.example.com/0', () => {
    assert.deepEqual(createRedisConnection(), {
      host: 'redis.example.com', port: 6379, db: 0, tls: {},
    })
  })
})

test('COS BullMQ connection rejects missing and malformed URLs', () => {
  withRedisEnv(undefined, () => assert.throws(() => createRedisConnection(), /Missing Redis connection/))
  withRedisEnv('https://redis.example.com', () => assert.throws(() => createRedisConnection(), /redis:\/\/ or rediss:\/\//))
  withRedisEnv('redis://redis.example.com/not-a-db', () => assert.throws(() => createRedisConnection(), /Invalid COS Redis database/))
})
