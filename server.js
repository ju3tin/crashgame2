const express = require('express');
const WebSocket = require('ws');
const path = require('path');
const mongoose = require("mongoose");
//mongoose.set('useFindAndModify', false);
//const express = require("express");
const cors = require("cors");
const passport = require("passport");
const passportLocal = require("passport-local").Strategy;
const cookieParser = require("cookie-parser");
const bcrypt = require("bcryptjs");
const session = require("express-session");
const bodyParser = require("body-parser");
//const app = express();
const User = require("./models/user");
const Game_loop = require("./models/game_loop")
require('dotenv').config()


// Configuration
const PORT = process.env.PORT || 3004;
const CHANCE_LESS_THAN_2 = 90;
const MAX_INT_MULTIPLY = 100;
const TIME_PER_ROUNDS = 10;
const TIME_AFTER_ROUND = 10;
const DELAY_PER_DELTA_MULT = 0.002;

// Initialize Express and WebSocket server
const app = express();
const server = require('http').createServer(app);
const wss = new WebSocket.Server({ server });

// Serve static files
const { Server } = require('socket.io')
app.use(express.static(path.join(__dirname, 'public')));

// Shared game state
let currentMultiplier = 1.0;
let totalMultiplier = 1.0;
let isGameRunning = false;
const clients = new Map(); // To track individual player states


//const server = http.createServer(app)
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
})

io.on("connection", (socket) => {
  socket.on("clicked", (data) => {
  })
})



// Connect to MongoDB 
mongoose.connect(
  process.env.MONGOOSE_DB_LINK,
 
);

// Backend Setup
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(
  cors({
    origin: true,
    credentials: true,
  })
);
app.use(
  session({
    secret: process.env.PASSPORT_SECRET,
    resave: true,
    saveUninitialized: true,

  })
);
app.use(cookieParser(process.env.PASSPORT_SECRET));
app.use(passport.initialize());
app.use(passport.session());
require("./passportConfig")(passport);

//Passport.js login/register system
app.post("/login", async (req, res, next) => {
  try {
    // Authenticate user using passport
    passport.authenticate("local", (err, user, info) => {
      if (err) {
        console.error(err);
        return res.status(500).send("Server error");
      }

      if (!user) {
        return res.status(400).send("Username or Password is Wrong");
      }

      // Log in the user
      req.logIn(user, (err) => {
        if (err) {
          console.error(err);
          return res.status(500).send("Error logging in user");
        }
        return res.send("Login Successful");
      });
    })(req, res, next);
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error during login process");
  }
});

app.post("/register", async (req, res) => {
  // Validate username and password length
  if (req.body.username.length < 3 || req.body.password.length < 3) {
    return res.status(400).send("Username and password must be at least 3 characters long");
  }

  try {
    // Check if username already exists
    const existingUser = await User.findOne({ username: req.body.username });

    if (existingUser) {
      return res.status(400).send("Username already exists");
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(req.body.password, 10);

    // Create new user
    const newUser = new User({
      username: req.body.username,
      password: hashedPassword,
    });

    // Save the new user to the database
    await newUser.save();

    res.send("User registered successfully!");
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error, please try again later");
  }
});

// Routes
app.get("/user", checkAuthenticated, (req, res) => {
  res.send(req.user);
});

app.get("/logout", (req, res) => {
  req.logout();
  res.send("success2")
});

function checkAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
      return next()
    }
  
    return res.send("No User Authentication")
  }
  
// Function to broadcast a message to all connected clients
function broadcast(message) {
    clients.forEach((_, client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(message));
        }
    });
}

// Handle WebSocket connections
wss.on('connection', (ws) => {
    console.log('New player connected.');

    // Initialize player state
    clients.set(ws, {
        isBetted: false,
        isTook: false,
        cntBalance: 100,
        cntBet: 0,
    });

    ws.on('message', (message) => {
        try {
            const playerState = clients.get(ws);
            const data = JSON.parse(message);

            switch (data.action) {
                case 'BTN_BET_CLICKED':
                    if (!playerState.isBetted && isGameRunning) {
                        // Player places a bet
                        playerState.cntBet = Math.min(data.bet, playerState.cntBalance);
                        playerState.isBetted = true;
                        playerState.cntBalance -= playerState.cntBet;
                        ws.send(JSON.stringify({ action: 'CNT_BALANCE', balance: playerState.cntBalance.toFixed(2) }));
                    } else if (playerState.isBetted && isGameRunning && !playerState.isTook) {
                        // Player cashes out
                        playerState.cntBalance += playerState.cntBet * currentMultiplier;
                        playerState.isTook = true;
                        ws.send(JSON.stringify({ action: 'WON', bet: playerState.cntBet, mult: currentMultiplier.toFixed(2) }));
                    }
                    break;

                default:
                    console.log('Unknown action:', data.action);
                    break;
            }
        } catch (error) {
            console.error('Error handling message:', error);
        }
    });

    ws.on('close', () => {
        console.log('Player disconnected.');
        clients.delete(ws);
    });

    ws.send(JSON.stringify({ action: 'CNT_BALANCE', balance: 100 }));
});


// Function to start the game
async function startGame() {
    while (true) {
        // Prepare round
        isGameRunning = false;
        currentMultiplier = 1.0;
        totalMultiplier = generateTotalMultiplier();
        broadcast({ action: 'ROUND_PREPARING' });
        
        // Countdown before starting the round
        for (let i = TIME_PER_ROUNDS; i > 0; i--) {
            broadcast({ action: 'COUNTDOWN', time: i });
            broadcast({ action: 'SECOND_BEFORE_START', data: i })
            await sleep(1000); // Sleep for 1 second
        }

        // Start round
        isGameRunning = true;
        broadcast({ action: 'ROUND_STARTED' });

        let crashed = false;

        // Increment multiplier
        while (currentMultiplier < totalMultiplier) {
            currentMultiplier += 0.01;
            broadcast({ action: 'CNT_MULTIPLY', multiplier: currentMultiplier.toFixed(2), data: currentMultiplier.toFixed(2)});
            await sleep(DELAY_PER_DELTA_MULT * 1000);

            if (currentMultiplier >= totalMultiplier) {
                crashed = true;
                break;
            }
        }

        // Crash event
        if (crashed) {
            broadcast({ action: 'ROUND_CRASHED', multiplier: totalMultiplier });
            clients.forEach((state, client) => {
                if (state.isBetted && !state.isTook) {
                    client.send(JSON.stringify({ action: 'LOST', bet: state.cntBet }));
                }
                state.isBetted = false;
                state.isTook = false;
            });
        }

        // Wait before next round
        await sleep(TIME_AFTER_ROUND * 1000);
    }
}

// Generate a random total multiplier
function generateTotalMultiplier() {
    let rndFloat = Math.random();
    let rndIsWithInt = Math.floor(Math.random() * 100);
    let rndInt = rndIsWithInt > CHANCE_LESS_THAN_2 ? Math.floor(Math.random() * MAX_INT_MULTIPLY) : 0;
    return rndInt + rndFloat + 1;
}

// Utility: Sleep function
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// Start the game
startGame().catch(console.error);

// Start the server
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});