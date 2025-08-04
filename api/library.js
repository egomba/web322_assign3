const express = require('express');
const exphbs = require('express-handlebars');
const fs = require('fs');
const path = require('path');
const session = require('express-session');
const rando = require('randomstring');
const serverless = require('serverless-http');
const { MongoClient, ObjectId } = require('mongodb');

const app = express();
const PORT = process.env.PORT || 3000;
const isVercel = !!process.env.VERCEL;

// MongoDB
const mongoUrl = 'mongodb+srv://egomba:Gomba123@egomba.ut79j.mongodb.net/?retryWrites=true&w=majority&appName=egomba';
const dbName = 'Web322';

let cachedClient = null;
let cachedDb = null;
async function connectToDatabase() {
  if (cachedDb) return cachedDb;
  const client = await MongoClient.connect(mongoUrl);
  cachedClient = client;
  cachedDb = client.db(dbName);
  return cachedDb;
}

// Load users
let users = {};
try {
  users = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'user.json'), 'utf8'));
} catch (err) {
  console.error('Error reading user.json:', err);
}

// Setup Handlebars
const hbs = exphbs.create({
  extname: '.hbs',
  partialsDir: path.join(__dirname, '..', 'views', 'partials'),
});
app.engine('.hbs', hbs.engine);
app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, '..', 'views'));

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(session({
  secret: 'someSecretKey',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 3 * 60 * 1000, secure: false },
}));

// Auth middleware
function Login(req, res, next) {
  if (!req.session.user) return res.redirect('/signin');
  next();
}

// Basic ping test route
app.get('/ping', (req, res) => res.send('pong'));

// Borrow/Return router setup (lazy loaded)
const { router: borrowReturnRouter, setup: borrowReturnSetup } = require('../routes/borrowReturnRouter');
app.use(async (req, res, next) => {
  if (!app.locals.borrowRouterInitialized) {
    try {
      const db = await connectToDatabase();
      borrowReturnSetup({ database: db, loginMiddleware: Login });
      app.use('/', borrowReturnRouter);
      app.locals.borrowRouterInitialized = true;
    } catch (e) {
      console.error('Router setup failed:', e);
    }
  }
  next();
});

// Routes
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
  const db = await connectToDatabase();
  const username = req.session.user;

  const books = await db.collection('library').find({}).toArray();
  const clientDoc = await db.collection('clients').findOne({ username });
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
});

app.get('/signout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// Local server only
if (!isVercel) {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

module.exports = isVercel ? serverless(app) : app;
