var path = require('path');
var _ = require('lodash');
var Q = require('q');
var logger = require(path.resolve(__dirname, '../lib/logger'));
var router = require('express').Router(); // eslint-disable-line new-cap
var passport = require('passport');
var BearerStrategy = require('passport-http-bearer');
var request = require('request');
var qs = require('querystring');
var micropub = require('connect-micropub');
var webmentions = require('webmentions');
var indieutil = require('@rcarls/indieutil');

var app = require(path.resolve(__dirname, '../app'));
var Note = require(path.resolve(__dirname, '../models/note'));
var NoteContext = require('../models/note-context');
var Person = require('../models/person');

// TODO: Check error logging (logs the message object)
passport.use(new BearerStrategy({}, function(token, done) {
  return Q.ninvoke(request, 'get', app.locals.site.tokenEndpoint, {
    headers: {
      authorization: 'Bearer ' + token,
    }
  })
    .spread(function(response, body) {
      if (response.statusCode !== 200) {
        logger.warn('Micropub: Token verification failed.');
        throw { message: 'Token verification failed', };
      }

      body = qs.parse(body);

      // Check scope
      var scopes = body.scope.split(' ');
      if (!body.scope || scopes.indexOf('create') === -1 && scopes.indexOf('post') === -1) {
        logger.warn('Micropub: No `create` scope.');
        throw { message: '[create] scope required', };
      }

      // Check client ID
      /*
        if (body.client_id !== app.locals.site.url + '/') {
        return done({ message: 'client not authorized', });
        }
      */

      return qs.parse(body);
    })
    .nodeify(done);
}));

router.post('', [
  passport.authenticate('bearer', { session: false, }),
  micropub.create({
    jf2: {
      preferredContentType: 'text/plain',
      implicitContentType: false,
      compact: false,
      references: false,
    },
  }),
], function(req, res) {
  indieutil
    .jf2FetchRefs(req.micropub, {
      jf2: {
        preferredContentType: 'text/plain',
        implicitContentType: 'text/plain',
        compact: false,
      },
      determinePostTypes: true,
    })
    .then(function(jf2) {

      // TODO: Set published in middleware
      jf2.published = new Date();

      logger.debug('Micropub JF2', jf2);

      var saveTasks = Object.keys(jf2.references).map(function(url) {
        var ref = jf2.references[url];

        // TODO: Allow customizing postTypes key (to _postTypes)
        ref._postTypes = _.clone(ref.postTypes);

        if (ref.type === 'cite') {
          return new NoteContext(ref).save();
        }

        if (ref.type === 'card') {
          // TODO: Set uid in toJf2 or fetch
          ref.uid = ref.uid || ref.url[0];
          
          return new Person(ref).save()
            .then(function(person) {
              logger.debug('Saved new person', person.toObject());
            });
        }

        return null;
      });

      delete jf2.references;
      
      return Q.all([
        new Note(jf2).save(),
        Q.allSettled(saveTasks),
      ]);
    })
    .spread(function(note, refs) {
      logger.info('Created new ' + note._postTypes[0], note.url);
      
      res.location(note.url)
        .status(201)
        .send();
      
      // Send webmentions
      note._mentionTargets.forEach(function(target) {
        // TODO: develop indieutil solution
        webmentions.proxyMention({
          source: note.url,
          target: target,
        }, function(err, data) {
          if (err) { logger.warn(err); return; }

          logger.info(data.message);
        });
      });
    })
    .catch(function(err) {
      logger.error(err);
      
      return res.status(500).send();
    });
    
});

router.get('/', micropub.query({
  config: {
    preview: app.locals.site.url + '/micropub/preview',
  },
}));


router.post('/preview', [
  passport.authenticate('bearer', { session: false, }),
  micropub.create({
    jf2: {
      preferredContentType: 'text/plain',
      implicitContentType: false,
      compact: false,
      references: 'embed',
    },
  }),
], function(req, res) {
  indieutil
    .jf2FetchRefs(req.micropub, {
      jf2: {
        preferredContentType: 'text/plain',
        implicitContentType: false,
        compact: false,
        references: 'embed',
      },
      embedReferences: true,
      determinePostTypes: true,
    })
    .then(function(jf2) {
      return res.render('note-preview.nunj.html', {
        note: new Note(jf2),
      });
    })
    .catch(function(err) {
      logger.error(err);
      
      return res.status(500).send();
    });
});

module.exports = router;
