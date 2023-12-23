'use strict'

const { clear, connInfo, isPg } = require('./helper')
const { test } = require('node:test')
const { deepEqual: same, equal } = require('node:assert/strict')
const Snap = require('@matteo.collina/snap')
const sqlOpenAPI = require('..')
const sqlMapper = require('@platformatic/sql-mapper')
const fastify = require('fastify')

const snap = Snap(__filename)

test('expose arrays', { skip: !isPg }, async (t) => {
  const app = fastify()
  app.register(sqlMapper, {
    ...connInfo,
    async onDatabaseLoad (db, sql) {
      await clear(db, sql)
      await db.query(sql`CREATE TABLE pages (
      id SERIAL PRIMARY KEY,
      title VARCHAR(42) NOT NULL,
      tags VARCHAR(42)[] NOT NULL
    );`)
    }
  })
  app.register(sqlOpenAPI)
  t.after(async () => {
    await app.close()
  })

  await app.ready()

  {
    const res = await app.inject({
      method: 'GET',
      url: '/documentation/json'
    })
    equal(res.json().info.version, '1.0.0', 'GET /documentation/json info version default')
  }

  {
    const res = await app.inject({
      method: 'POST',
      url: '/pages',
      body: {
        title: 'Hello',
        tags: ['foo', 'bar']
      }
    })
    equal(res.statusCode, 200, 'POST /pages status code')
    equal(res.headers.location, '/pages/1', 'POST /api/pages location')
    same(res.json(), {
      id: 1,
      title: 'Hello',
      tags: ['foo', 'bar']
    }, 'POST /pages response')
  }

  {
    const res = await app.inject({
      method: 'GET',
      url: '/pages/1'
    })
    equal(res.statusCode, 200, 'GET /pages/1 status code')
    same(res.json(), {
      id: 1,
      title: 'Hello',
      tags: ['foo', 'bar']
    }, 'GET /pages/1 response')
  }

  {
    const res = await app.inject({
      method: 'GET',
      url: '/pages?where.tags.any=foo'
    })
    equal(res.statusCode, 200, 'GET /pages/1 status code')
    same(res.json(), [{
      id: 1,
      title: 'Hello',
      tags: ['foo', 'bar']
    }], 'GET /pages/1 response')
  }

  {
    const res = await app.inject({
      method: 'GET',
      url: '/pages?where.tags.any=baz'
    })
    equal(res.statusCode, 200, 'GET /pages/1 status code')
    same(res.json(), [], 'GET /pages/1 response')
  }

  {
    const res = await app.inject({
      method: 'GET',
      url: '/pages?where.tags.all=foo'
    })
    equal(res.statusCode, 200, 'GET /pages/1 status code')
    same(res.json(), [], 'GET /pages/1 response')
  }

  {
    const res = await app.inject({
      method: 'GET',
      url: '/pages?where.tags.contains=foo'
    })
    equal(res.statusCode, 200, 'GET /pages/1 status code')
    same(res.json(), [{
      id: 1,
      title: 'Hello',
      tags: ['foo', 'bar']
    }], 'GET /pages/1 response')
  }

  {
    const res = await app.inject({
      method: 'GET',
      url: '/pages?where.tags.contained=foo,bar'
    })
    equal(res.statusCode, 200, 'GET /pages/1 status code')
    same(res.json(), [{
      id: 1,
      title: 'Hello',
      tags: ['foo', 'bar']
    }], 'GET /pages/1 response')
  }

  {
    const res = await app.inject({
      method: 'GET',
      url: '/pages?where.tags.overlaps=foo'
    })
    equal(res.statusCode, 200, 'GET /pages/1 status code')
    same(res.json(), [{
      id: 1,
      title: 'Hello',
      tags: ['foo', 'bar']
    }], 'GET /pages/1 response')
  }

  {
    const res = await app.inject({
      method: 'PUT',
      url: '/pages/1',
      body: {
        title: 'Hello World',
        tags: ['foo', 'bar', 'baz']
      }
    })
    equal(res.statusCode, 200, 'PUT /pages/1 status code')
    same(res.json(), {
      id: 1,
      title: 'Hello World',
      tags: ['foo', 'bar', 'baz']
    }, 'PUT /pages/1 response')
  }

  {
    const res = await app.inject({
      method: 'GET',
      url: '/pages/1'
    })
    equal(res.statusCode, 200, 'GET /pages/1 status code')
    same(res.json(), {
      id: 1,
      title: 'Hello World',
      tags: ['foo', 'bar', 'baz']
    }, 'GET /pages/1 response')
  }

  {
    const res = await app.inject({
      method: 'POST',
      url: '/pages',
      body: {
        tilte: 'Hello' // typo, wrong field
      }
    })
    equal(res.statusCode, 400, 'POST /pages status code')
    equal(res.headers.location, undefined, 'no location header')
    same(res.json(), {
      statusCode: 400,
      code: 'FST_ERR_VALIDATION',
      error: 'Bad Request',
      message: "body must have required property 'tags'"
    }, 'POST /pages response')
  }

  {
    const res = await app.inject({
      method: 'GET',
      url: '/documentation/json'
    })
    const json = res.json()
    const snapshot = await snap(json)
    same(json, snapshot)
  }

  {
    const res = await app.inject({
      method: 'GET',
      url: '/pages/1?fields=title,tags'
    })
    same(res.json(), {
      title: 'Hello World',
      tags: ['foo', 'bar', 'baz']
    }, 'GET /pages/1?fields=title response')
  }

  {
    const res = await app.inject({
      method: 'PUT',
      url: '/pages/1?fields=title,tags',
      body: {
        title: 'Hello fields',
        tags: []
      }
    })
    same(res.json(), {
      title: 'Hello fields',
      tags: []
    }, 'PUT /pages/1?fields=title response')
  }
})
