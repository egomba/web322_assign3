const express = require('express');
const exphbs = require('express-handlebars');
const fs = require('fs');
const path = require('path');
const sesh = require('express-session');
const rando = require('randomstring');
const serverless = require('serverless-http'); // For Vercel serverless

const { MongoClient, ObjectId } = require('mongodb');

const app = express();

const PORT = process.env.PORT || 3000;
const isVercel = !!process.env.VERCEL;  // Detect Vercel environment

const { router: borrowReturnRouter, setup: borrowReturnSetup } = require('../routes/borrowReturnRouter');

// MongoDB connection info
const mongoUrl = 'mongodb+srv://egomba:Gomba123@egomba.ut79j.mongodb.net/?retryWrites=true&w=majority&appName=egomba';
const dbName = 'Web322';

// We'll keep these for cached DB and client to reuse
let db;
let client;

// Setup Handlebars
const hbs = exphbs.create({
  extname: '.hbs',
  partialsDir: path.join(__dirname,'..', 'views', 'partials')
});

app.engine('.hbs', hbs.engine);
app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, '..', 'views'));

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(sesh({
  secret: 'someSecretKey',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 3 * 60 * 1000,
    secure: false
  }
}));

// Read users from user.json synchronously to avoid timing issues
const userFile = path.join(__dirname, '..', 'user.json');
let users = {};
try {
  users = JSON.parse(fs.readFileSync(userFile, 'utf8'));
} catch (err) {
  console.error('Error reading user.json:', err);
}

// Session login middleware
function Login(req, res, next) {
  if (!req.session.user) return res.redirect('/signin');
  next();
}

// Connect to MongoDB with caching
let cachedClient = null;
let cachedDb = null;

async function connectToDatabase() {
  if (cachedClient && cachedDb) {
    return cachedDb;
  }
  const client = await MongoClient.connect(mongoUrl);  // no options needed
  const db = client.db(dbName);
  cachedClient = client;
  cachedDb = db;
  return db;
}


// Initialize app routes and start server (or export for Vercel)
async function init() {
  try {
    const database = await connectToDatabase();

    borrowReturnSetup({ database, loginMiddleware: Login });
    app.use('/', borrowReturnRouter);

    app.get('/', (req, res) => res.render('landing'));

    app.get('/signin', (req, res) => res.render('signin', { error: null }));

    app.post('/signin', (req, res) => {
      const { username, password } = req.body;
      if (!users[username]) return res.render('signin', { error: 'not a registered username' });
      if (users[username] !== password) return res.render('signin', { error: 'invalid Password', username });

      req.session.user = username;
      req.session.token = rando.generate(16);
      res.redirect('/home');
    });

    app.get('/home', Login, async (req, res) => {
      const username = req.session.user;
      try {
        const books = await database.collection('library').find({}).toArray();
        const clientDoc = await database.collection('clients').findOne({ username });
        const borrowedIDs = clientDoc?.IDBooksBorrowed || [];

        const borrowedBooks = books.filter(book =>
          borrowedIDs.some(id => id.toString() === book._id.toString())
        );

        const availableBooks = books.filter(book =>
          book.available && !borrowedIDs.some(id => id.toString() === book._id.toString())
        );

        res.render('home', {
          username,
          borrowedBooks: borrowedBooks.map(b => ({ ...b, _id: b._id.toString() })),
          availableBooks: availableBooks.map(b => ({ ...b, _id: b._id.toString() })),
        });
      } catch (err) {
        console.error('Error fetching books or client info:', err);
        res.status(500).send('Internal Server Error');
      }
    });

    app.get('/ping', (req, res) => res.send('pong'));

    app.get('/signout', (req, res) => {
      req.session.destroy(() => res.redirect('/'));
    });

  } catch (err) {
    console.error('Failed to initialize app:', err);
    throw err;  // rethrow to handle in caller
  }
}


// Run init and start server (locally) or export for Vercel
(async () => {
  try {
    await init();

    if (!isVercel) {
      app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
      });
    }
  } catch (err) {
    console.error('Initialization failed:', err);
  }
})();

module.exports = isVercel ? serverless(app) : app;
