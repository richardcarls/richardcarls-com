var path = require('path');
var router = require('express').Router(); // eslint-disable-line new-cap

var Note = require(path.resolve(__dirname, '../models/note'));
var app = require(path.resolve(__dirname, '../app'));
var logger = require(path.resolve(__dirname, '../lib/logger.js'));

router.get('/', function(req, res) {
  Note.find({}, function(err, notes) {
    if (err) { logger.error(err); }
    
    return res.render('notes/notes-list.nunj.html', {
      locals: app.locals,
      user: req.user,
      notes: notes,
    });
  });
});

router.get('/:slug', function(req, res) {
  Note.findOne({ slug: req.params.slug, }, function (err, note) {
    if (err) {
      logger.error(err);

      res.status(404).send();
    }

    return res.render('notes/notes-single.nunj.html', {
      locals: app.locals,
      user: req.user,
      note: note,
    });
  });
});

module.exports = router;
