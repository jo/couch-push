// couch-push
// (c) 2014 Johannes J. Schmidt

var crypto = require('crypto');
var assert = require('assert');
var async = require('async');
var nano = require('nano');
var compile = require('couch-compile');


module.exports = function push(url, source, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  options = options || {};

  try {
    var db = nano(url);
  } catch(e) {
    return callback({ error: 'invalid_url', reason: 'Not a valid database URL: ' + url });
  }

  if (!db.config.db) {
    return callback({ error: 'no_db', reason: 'Not a database: ' + url });
  }


  function pushDoc(doc, attachments) {
    if (options.multipart) {
      db.multipart.insert(doc, attachments, doc._id, callback);
    } else {
      db.insert(doc, doc._id, callback);
    }
  }

  function diffAttachment(attachment, existingAttachment) {
    if (!existingAttachment) {
      return false;
    }

    var md5sum = crypto.createHash('md5');
    var data = options.multipart ? attachment.data : new Buffer(attachment.data, 'base64');
    md5sum.update(data);
    var digest = 'md5-' + md5sum.digest('base64');

    return existingAttachment.digest === digest;
  }

  function diffDoc(doc, existingDoc, attachments) {
    doc._rev = existingDoc._rev;

    if (options.multipart) {
      if (attachments && attachments.length) {
        for (var i = 0; i < attachments.length; i++) {
          var name = attachments[i].name;
          var identical = diffAttachment(attachments[i], existingDoc && existingDoc._attachments && existingDoc._attachments[name]);

          if (identical) {
            doc._attachments = doc._attachments || {};
            doc._attachments[name] = existingDoc._attachments[name];
            attachments.splice(i--, 1);
          }
        };
      }
    } else {
      if (doc._attachments) {
        Object.keys(doc._attachments).forEach(function(name) {
          var identical = diffAttachment(doc._attachments[name], existingDoc && existingDoc._attachments && existingDoc._attachments[name]);

          if (identical) {
            doc._attachments[name] = existingDoc._attachments[name];
          }
        });
      }
    }

    try {
      assert.deepEqual(doc, existingDoc);
      if (options.multipart) {
        assert.equal(attachments.length, 0);
      }

      callback(null, { ok: true, id: doc._id, rev: doc._rev, unchanged: true });
    } catch(e) {
      pushDoc(doc, attachments);
    }
  }

  function getDoc(doc, attachments) {
    db.get(doc._id, function(err, response) {
      if (err && err.status_code === 404) {
        return pushDoc(doc, attachments);
      }

      diffDoc(doc, response, attachments);
    })
  }

  
  function compileDoc() {
    compile(source, options, function(err, doc, attachments) {
      if (err) {
        return callback(err);
      }

      if (!doc.doc._id) {
        return callback({ error: 'missing_id', reason: 'Missing _id property' });
      }

      getDoc(doc.doc, attachments);
    });
  }


  var couch = nano(db.config.url);
  couch.db.get(db.config.db, function(err, info) {
    if (err && err.status_code === 404) {
      return couch.db.create(db.config.db, function(err, response) {
        if (err) {
          return callback({ error: err.error, reason: err.reason });
        }

        compileDoc();
      });
    }

    if (err) {
      return callback({ error: err.error, reason: err.reason });
    }

    compileDoc();
  });
};
