const express = require('express');
const exphbs = require('express-handlebars');
const fs = require('fs');
const path = require('path');
const session = require('express-session');
const rando = require('randomstring');
const { MongoClient, ObjectId } = require('mongodb');

const app = express();
const PORT = process.env.PORT || 3000;  // Heroku sets PORT env var

// MongoDB connection
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

// Load users synchronously
let users = {};
try {
  users = JSON.parse(fs.readFileSync(path.join(__dirname, 'user.json'), 'utf8'));
} catch (err) {
  console.error('Error reading user.json:', err);
}

// Setup Handlebars
const hbs = exphbs.create({
  extname: '.hbs',
  partialsDir: path.join(__dirname, 'views', 'partials'),
});
app.engine('.hbs', hbs.engine);
app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
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

// Basic ping route
app.get('/ping', (req, res) => res.send('pong'));

// Borrow/Return router setup
const { router: borrowReturnRouter, setup: borrowReturnSetup } = require('./routes/borrowReturnRouter');

(async () => {
  try {
    const db = await connectToDatabase();
    borrowReturnSetup({ database: db, loginMiddleware: Login });
    app.use('/', borrowReturnRouter);
  } catch (e) {
    console.error('Router setup failed:', e);
  }
})();

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
  } catch (err) {
    console.error('Error fetching books or client info:', err);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/signout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// Start server (Heroku uses PORT env var)
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
