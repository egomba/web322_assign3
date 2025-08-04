// /api/routes/borrowReturnRouter.js

const express = require('express');
const { ObjectId } = require('mongodb');

function isValidObjectId(id) {
  return ObjectId.isValid(id) && String(new ObjectId(id)) === id;
}

let router;
function setup({ database, loginMiddleware }) {
  const db = database;
  const Login = loginMiddleware;

  router = express.Router();

  // BORROW
  router.post('/borrow', Login, async (req, res) => {
    let selectedIds = req.body.books;
    const username = req.session.user;

    if (!selectedIds) return res.redirect('/home');
    if (!Array.isArray(selectedIds)) selectedIds = [selectedIds];

    selectedIds = selectedIds.filter(isValidObjectId).map(id => new ObjectId(id));

    try {
      await db.collection('library').updateMany(
        { _id: { $in: selectedIds }, available: true },
        { $set: { available: false } }
      );

      await db.collection('clients').updateOne(
        { username },
        { $addToSet: { IDBooksBorrowed: { $each: selectedIds } } },
        { upsert: true }
      );

      res.redirect('/home');
    } catch (err) {
      console.error('Borrow error:', err);
      res.status(500).send('Error processing borrow request');
    }
  });

  // RETURN
  router.post('/return', Login, async (req, res) => {
    let selectedIds = req.body.books;
    const username = req.session.user;

    if (!selectedIds) return res.redirect('/home');
    if (!Array.isArray(selectedIds)) selectedIds = [selectedIds];

    selectedIds = selectedIds.filter(isValidObjectId).map(id => new ObjectId(id));

    try {
      await db.collection('library').updateMany(
        { _id: { $in: selectedIds } },
        { $set: { available: true } }
      );

      await db.collection('clients').updateOne(
        { username },
        { $pull: { IDBooksBorrowed: { $in: selectedIds } } }
      );

      res.redirect('/home');
    } catch (err) {
      console.error('Return error:', err);
      res.status(500).send('Error processing return request');
    }
  });
}

module.exports = {
  setup,
  get router() {
    return router;
  }
};
