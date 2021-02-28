const url = process.env.COUCH || 'http://localhost:5984'
const dbname = 'couchdb-push-test'

const async = require('async')
const nano = require('nano')
const path = require('path')
const test = require('tap').test
const push = require('..')

const docs = [
  path.join(__dirname, 'fixtures/doc.json'),
  path.join(__dirname, 'fixtures/otherdoc.json')
]
const userdocs = [
  path.join(__dirname, 'fixtures/user.json'),
  path.join(__dirname, 'fixtures/changed-user.json')
]
const couch = nano(url)
const db = couch.use(dbname)

function rm (db, id, callback) {
  db.get(id, function (error, doc) {
    if (error) return callback(null)
    db.destroy(id, doc._rev, callback)
  })
}

test('database not present', function (t) {
  couch.db.destroy(dbname, function () {
    push(url + '/' + dbname, docs[0], function (error, response) {
      t.error(error, 'no error')
      t.equal(response.ok, true, 'response is ok')
      t.type(response.rev, 'string', 'response has rev')
      t.type(response.id, 'string', 'response has id')
      t.equal(response.unchanged, undefined, 'response is not unchanged')

      t.end()
    })
  })
})

test('database is present', function (t) {
  couch.db.create(dbname, function () {
    push(url + '/' + dbname, docs[0], function (error, response) {
      t.error(error, 'no error')
      t.equal(response.ok, true, 'response is ok')

      t.end()
    })
  })
})

test('url as nano object', function (t) {
  push(db, docs[0], function (error, response) {
    t.error(error, 'no error')
    t.equal(response.ok, true, 'response is ok')

    t.end()
  })
})

test('source as object', function (t) {
  push(db, { _id: 'foo-bar', foo: 'bar' }, function (error, response) {
    t.error(error, 'no error')
    t.equal(response.ok, true, 'response is ok')
    t.equal(response.id, 'foo-bar', 'response is ok')

    t.end()
  })
})

test('source as object without _id fails', function (t) {
  push(db, { foo: 'bar' }, function (error) {
    t.ok(error, 'there is an error')
    t.equal(error.message, 'Missing _id property', 'correct error thown')

    t.end()
  })
})

test('doc unchanged', function (t) {
  couch.db.destroy(dbname, function () {
    push(url + '/' + dbname, docs[0], function (error, response) {
      t.error(error, 'no error')
      push(url + '/' + dbname, docs[0], function (error, response) {
        t.error(error, 'no error')
        t.equal(response.ok, true, 'response is ok')
        t.type(response.rev, 'string', 'response has rev')
        t.type(response.id, 'string', 'response has id')
        t.equal(response.unchanged, true, 'response is unchanged')

        t.end()
      })
    })
  })
})

test('user unchanged', function (t) {
  const user = require(userdocs[0])
  rm(couch.use('_users'), user._id, function (error) {
    t.error(error, 'no error')
    push(url + '/_users', userdocs[0], function (error, response) {
      t.error(error, 'no error')
      push(url + '/_users', userdocs[0], function (error, response) {
        t.error(error, 'no error')
        t.equal(response.ok, true, 'response is ok')
        t.type(response.rev, 'string', 'response has rev')
        t.type(response.id, 'string', 'response has id')
        t.equal(response.unchanged, true, 'response is unchanged')

        t.end()
      })
    })
  })
})

test('user password changed', function (t) {
  push(url + '/_users', userdocs[0], function (error, response) {
    t.error(error, 'no error')
    const rev = response.rev
    push(url + '/_users', userdocs[1], function (error, response) {
      t.error(error, 'no error')
      t.equal(response.ok, true, 'response is ok')
      t.notOk(response.unchanged, 'response is unchanged')
      t.ok(rev !== response.rev, 'rev has been changed')

      t.end()
    })
  })
})

test('database containing a slash', function (t) {
  const name = dbname + '/one'
  couch.db.destroy(name, function () {
    push(url + '/' + encodeURIComponent(name), docs[0], function (error, response) {
      t.error(error, 'no error')
      t.equal(response.ok, true, 'response is ok')

      t.end()
    })
  })
})

test('concurrency', function (t) {
  couch.db.destroy(dbname, function () {
    async.map(docs, function (doc, done) {
      push(url + '/' + dbname, doc, done)
    }, function (error, responses) {
      t.error(error, 'no error')
      t.equal(responses.length, docs.length, 'correct # of docs pushed')
      responses.forEach(function (response) {
        t.equal(typeof response, 'object', 'response is object')
        t.equal(response.ok, true, 'response is ok')
      })

      t.end()
    })
  })
})
