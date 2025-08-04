const express = require('express');
const exphbs = require('express-handlebars');
const fs = require('fs');
const path = require('path');
const sesh = require(`express-session`);
const rando = require(`randomstring`);
const { MongoClient, ObjectId } = require('mongodb');
const app = express();

//const PORT = 3000;

const { router: borrowReturnRouter, setup: borrowReturnSetup } = require('./routes/borrowReturnRouter');




// mongodb 


const mongoUrl = 'mongodb+srv://egomba:Gomba123@egomba.ut79j.mongodb.net/?retryWrites=true&w=majority&appName=egomba';
const dbName = 'Web322';

let db;
MongoClient.connect(mongoUrl, { useUnifiedTopology: true })
  .then(client => {
    console.log('✅ Connected to MongoDB');
    db = client.db(dbName);

    // Pass db and Login middleware to borrowReturnRouter
borrowReturnSetup({ database: db, loginMiddleware: Login });

// Use the router for borrow/return routes
app.use('/', borrowReturnRouter);


    // Now start your Express server AFTER db is ready
    app.listen(PORT, () => {
      console.log(`Server listening at http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('Failed to connect to MongoDB', err);
  });


// heading partial

const hbs = exphbs.create({
    extname: '.hbs',  
    partialsDir: path.join(__dirname, 'views', 'partials')  
});

// handebars as the view enging


app.engine('.hbs', hbs.engine);
app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));


// middleware ( to extract info)

app.use( express.urlencoded({extended: true}));
app.use(express.static(path.join(__dirname, `public`)));


//sessions set up

// Setup sessions with 'sesh'
app.use(sesh({
    secret: 'someSecretKey',
    resave: false,
    saveUninitialized: false,
     cookie: {
    maxAge: 3 * 60 * 1000, // 3 minutes
    secure: false // true if using HTTPS
  }
}));

// read users from user.json

const userFile = path.join ( __dirname, `user.json`);
let users = {};

fs.readFile(userFile, `Utf8`, (err,data) => {
if (err) {
    console.error(`Error reading user.json`, err);
} else {
    users = JSON.parse(data);
}
});


//session checker 

function Login(req, res, next) {
    console.log('Login middleware session user:', req.session.user);
    if (!req.session.user) {
        return res.redirect('/signin');
    }
    next();
}


//ROUTER




// ROUTES

/*   ** routing template  C+P when needed


app.get(`/` , (req, res) => { 
    res.render(``);
});

*/


// LAnding page

app.get(`/` , (req, res) => { 
    res.render(`landing`);
});


//sign in page
app.get(`/signin` , (req, res) => { 
    res.render(`signin`, {error: null});
});

//handle signin form W/SESSIONS

app.post(`/signin` , (req, res) => { 

    const { username, password} = req.body;

    if (!users[username]){
        return res.render(`signin`, {error : `not a registered username`});
    }

    if (users[username] !== password){
        return res.render(`signin`, {error : `invalid Password`, username// reinsert username in form 
        });
    }


req.session.user = username
    req.session.token = rando.generate(16);
    console.log(`Session token for ${username}:`, req.session.token);

res.redirect(`/home`);
});


app.get('/home', Login, async (req, res) => {
  const username = req.session.user;

  try {
    const books = await db.collection('library').find({}).toArray();
    const clientDoc = await db.collection('clients').findOne({ username });
    const borrowedIDs = clientDoc?.IDBooksBorrowed || [];

    // Borrowed books = in borrowedIDs
    const borrowedBooks = books.filter(book =>
      borrowedIDs.includes(book._id)
    );

    // Available books = available == true and NOT already borrowed
    const availableBooks = books.filter(book =>
      book.available && !borrowedIDs.includes(book._id)
    );

    // Ensure _id is included and converted to string (if needed)
    const borrowedBooksStr = borrowedBooks.map(book => ({
      _id: String(book._id),
      title: book.title,
      author: book.author,
      available: book.available
    }));

    const availableBooksStr = availableBooks.map(book => ({
      _id: String(book._id),
      title: book.title,
      author: book.author,
      available: book.available
    }));

    // Debug
    console.log('✅ AvailableBooks:', availableBooksStr.map(b => b._id));
    console.log('✅ BorrowedBooks:', borrowedBooksStr.map(b => b._id));

    res.render('home', {
      username,
      availableBooks: availableBooksStr,
      borrowedBooks: borrowedBooksStr
    });

  } catch (err) {
    console.error('Error fetching books or client info:', err);
    res.status(500).send('Internal Server Error');
  }
});



//borrow return

//debug checker
function isValidObjectId(id) {
  return ObjectId.isValid(id) && String(new ObjectId(id)) === id;
}

// borrow

// app.post('/borrow', Login, async (req, res) => {
//   let selectedIds = req.body.books;
//   const username = req.session.user;

//   console.log("borrow");
//   console.log("Selected IDs:", selectedIds);
//   console.log("Username:", username);

//   if (!selectedIds) return res.redirect('/home');
//   if (!Array.isArray(selectedIds)) selectedIds = [selectedIds];

//   try {
//     // Find books that are available and match selected IDs (string comparison)
//     const booksToBorrow = await db.collection('library')
//       .find({ _id: { $in: selectedIds }, available: true })
//       .toArray();

//     if (booksToBorrow.length === 0) {
//       console.log("No books available to borrow with those IDs");
//       return res.redirect('/home');
//     }

//     // IDs of books to borrow
//     const borrowedIDs = booksToBorrow.map(book => book._id);

//     // Mark books as unavailable
//     await db.collection('library').updateMany(
//       { _id: { $in: borrowedIDs } },
//       { $set: { available: false } }
//     );

//     // Add borrowed books to client's borrowed list (no duplicates)
//     await db.collection('clients').updateOne(
//       { username },
//       { $addToSet: { IDBooksBorrowed: { $each: borrowedIDs } } },
//       { upsert: true }
//     );

//     res.redirect('/home');
//   } catch (err) {
//     console.error('Borrow error:', err);
//     res.status(500).send('Error processing borrow request');
//   }
// });


// // return
// app.post('/return', Login, async (req, res) => {
//   let selectedIds = req.body.books;
//   const username = req.session.user;
//   console.log("return");

//   if (!selectedIds) return res.redirect('/home');
//   if (!Array.isArray(selectedIds)) selectedIds = [selectedIds];

//   try {
//     await db.collection('library').updateMany(
//       { _id: { $in: selectedIds } },
//       { $set: { available: true } }
//     );

//     await db.collection('clients').updateOne(
//       { username },
//       { $pull: { IDBooksBorrowed: { $in: selectedIds } } }
//     );

//     res.redirect('/home');
//   } catch (err) {
//     console.error('Return error:', err);
//     res.status(500).send('Error processing return request');
//   }
// });



// signout

app.get('/signout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error('Error destroying session:', err);
    }
    res.redirect('/'); 
  });
});


// start the server

// app.listen(PORT, ()=> {
// console.log (`Library app is running at localhost:${PORT}`);

// });

// Export for Vercel
module.exports = serverless(app);


