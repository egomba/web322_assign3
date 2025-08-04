const express = require('express');
const exphbs = require('express-handlebars');
const fs = require('fs');
const path = require('path');
const sesh = require(`express-session`);
const rando = require(`randomstring`);
const serverless = require('serverless-http');

const app = express();
const PORT = 3000;



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


// homepage ( if sign in was succesful)

app.get(`/home`, Login, (req, res) => { 
const booksFile = path.join(__dirname, 'books.json');
let books = [];
  try {
        const data = fs.readFileSync(booksFile, 'utf8');
        books = JSON.parse(data);
    } catch (err) {
        console.error('Error reading books.json:', err);
    }
  
    const username = req.session.user;
    let availableBooks = books.filter(book => book.available);
    let borrowedBooks = books.filter(book => !book.available );
  res.render (`home`, {
    username,
    availableBooks,
    borrowedBooks
  });
});

/// BORROW / RETURN
// borrow
app.post(`/borrow`, Login, (req,res) => {
    let selectedBooks = req.body.books;
    const username = req.session.user;
console.log(`borrow`);
  

    //One book
    if (!Array.isArray(selectedBooks)) {
        selectedBooks = [selectedBooks];
    }


    const booksPath = path.join(__dirname, `books.json`);
    let books = JSON.parse(fs.readFileSync(booksPath, `utf-8`));

    const updated = books.map(book => {
        if (selectedBooks.includes(book.title) && book.available){
            return {
                ...book,
                available: false
            };

        }
        return book;
    });
    
     fs.writeFileSync(booksPath, JSON.stringify(updated, null, 2));
     res.redirect('/home');


});

//return
app.post('/return', Login, (req, res) => {
    let selectedBooks = req.body.books;
    const username = req.session.user;
console.log(`return`);

    // onebook
    if (!Array.isArray(selectedBooks)) {
        selectedBooks = [selectedBooks];
    }

    const booksPath = path.join(__dirname, 'books.json');
    let books = JSON.parse(fs.readFileSync(booksPath, 'utf-8'));

    const updated = books.map(book => {
        
        if (selectedBooks.includes(book.title) && !book.available) {
            return {
                ...book,
                available: true  // true = returned
            };
        }
        return book;
    });

    fs.writeFileSync(booksPath, JSON.stringify(updated, null, 2));
    res.redirect('/home');

});





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


// vercel
module.exports.handler = serverless(app);


