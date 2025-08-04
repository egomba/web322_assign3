const express = require('express');
const exphbs = require('express-handlebars');
const path = require('path');
const sesh = require('express-session');
const rando = require('randomstring');
const { MongoClient, ObjectId } = require('mongodb');
const serverless = require('serverless-http');
const { router: borrowReturnRouter, setup: borrowReturnSetup } = require('./routes/borrowReturnRouter');

const app = express();

// Handlebars setup
const hbs = exphbs.create({
  extname: '.hbs',
  partialsDir: path.join(__dirname, 'views', 'partials'),
});
app.engine('.hbs', hbs.engine);
app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Sessions setup (Warning: MemoryStore is not production-ready)
app.use(
  sesh({
    secret: 'someSecretKey',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 3 * 60 * 1000, secure: false },
  })
);

const userFile = path.join(__dirname, 'user.json');
let users = {};
const fs = require('fs');
try {
  users = JSON.parse(fs.readFileSync(userFile, 'utf8'));
} catch (err) {
  console.error('Error reading user.json:', err);
}

// MongoDB connection caching for serverless:
const mongoUrl = 'your-mongo-urimongodb+srv://egomba:Gomba123@egomba.ut79j.mongodb.net/?retryWrites=true&w=majority&appName=egomba';
const dbName = 'Web322';

let cachedClient = null;
let cachedDb = null;

async function connectToDatabase() {
  if (cachedClient && cachedDb) return { client: cachedClient, db: cachedDb };

  const client = await MongoClient.connect(mongoUrl);
  const db = client.db(dbName);
  cachedClient = client;
  cachedDb = db;
  return { client, db };
}

// Middleware for login check
function Login(req, res, next) {
  if (!req.session.user) return res.redirect('/signin');
  next();
}

// Setup borrowReturnRouter after DB connection:
borrowReturnSetup({ getDb: connectToDatabase, loginMiddleware: Login });
app.use('/', borrowReturnRouter);

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
  try {
    const { db } = await connectToDatabase();
    const username = req.session.user;
    const books = await db.collection('library').find({}).toArray();
    const clientDoc = await db.collection('clients').findOne({ username });
    const borrowedIDs = clientDoc?.IDBooksBorrowed || [];

    const borrowedBooks = books.filter(book => borrowedIDs.includes(book._id.toString()));
    const availableBooks = books.filter(
      book => book.available && !borrowedIDs.includes(book._id.toString())
    );

    res.render('home', {
      username,
      borrowedBooks: borrowedBooks.map(book => ({
        _id: book._id.toString(),
        title: book.title,
        author: book.author,
        available: book.available,
      })),
      availableBooks: availableBooks.map(book => ({
        _id: book._id.toString(),
        title: book.title,
        author: book.author,
        available: book.available,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/signout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

module.exports = serverless(app);
