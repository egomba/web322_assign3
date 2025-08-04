const express = require('express');
const exphbs = require('express-handlebars');
const fs = require('fs');
const path = require('path');
const sesh = require('express-session');
const rando = require('randomstring');
const serverless = require('serverless-http');
const { MongoClient, ObjectId } = require('mongodb');

const app = express();
const PORT = process.env.PORT || 3000;
const isVercel = !!process.env.VERCEL;

const { router: borrowReturnRouter, setup: borrowReturnSetup } = require('../routes/borrowReturnRouter');

// MongoDB
const mongoUrl = 'mongodb+srv://egomba:Gomba123@egomba.ut79j.mongodb.net/?retryWrites=true&w=majority&appName=egomba';
const dbName = 'Web322';
let cachedClient = null;
let cachedDb = null;

async function connectToDatabase() {
  if (cachedDb) return cachedDb;
  cachedClient = await MongoClient.connect(mongoUrl);
  cachedDb = cachedClient.db(dbName);
  return cachedDb;
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
app.use(
  sesh({
    secret: 'someSecretKey',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 3 * 60 * 1000, secure: false },
  })
);

// Load users
const userFile = path.join(__dirname, '..', 'user.json');
let users = {};
try {
  users = JSON.parse(fs.readFileSync(userFile, 'utf8'));
} catch (err) {
  console.error('Error reading user.json:', err);
}

// Auth middleware
function Login(req, res, next) {
  if (!req.session.user) return res.redirect('/signin');
  next();
}

// Setup borrow/return router after DB connected
connectToDatabase().then((db) => {
  borrowReturnSetup({ database: db, loginMiddleware: Login });
  app.use('/', borrowReturnRouter);
});

// Routes
app.get('/ping', (req, res) => res.send('pong'));

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
    const db = await connectToDatabase();
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
  } catch (err) {
    console.error('Error fetching books or client info:', err);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/signout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// Local only
if (!isVercel) {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

module.exports = isVercel ? serverless(app) : app;
