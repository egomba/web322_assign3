const express = require('express');
const router = express.Router();

let db;
let Login;

function setup({ database, loginMiddleware }) {
  db = database;
  Login = loginMiddleware;

  // Define routes AFTER dependencies are set
  router.post('/borrow', Login, async (req, res) => {
    let selectedIds = req.body.books;
    const username = req.session.user;

    if (!selectedIds) return res.redirect('/home');
    if (!Array.isArray(selectedIds)) selectedIds = [selectedIds];

    try {
      const booksToBorrow = await db.collection('library')
        .find({ _id: { $in: selectedIds }, available: true })
        .toArray();

      if (booksToBorrow.length === 0) {
        return res.redirect('/home');
      }

      const borrowedIDs = booksToBorrow.map(book => book._id);

      await db.collection('library').updateMany(
        { _id: { $in: borrowedIDs } },
        { $set: { available: false } }
      );

      await db.collection('clients').updateOne(
        { username },
        { $addToSet: { IDBooksBorrowed: { $each: borrowedIDs } } },
        { upsert: true }
      );

      res.redirect('/home');
    } catch (err) {
      console.error('Borrow error:', err);
      res.status(500).send('Error processing borrow request');
    }
  });

  router.post('/return', Login, async (req, res) => {
    let selectedIds = req.body.books;
    const username = req.session.user;

    if (!selectedIds) return res.redirect('/home');
    if (!Array.isArray(selectedIds)) selectedIds = [selectedIds];

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

module.exports = { router, setup };
