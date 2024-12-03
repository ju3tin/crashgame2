const express = require('express');
const WebSocket = require('ws');
const path = require('path');

// Configuration
const PORT = process.env.PORT || 3004;
const CHANCE_LESS_THAN_2 = 90;
const MAX_INT_MULTIPLY = 100;
const TIME_PER_ROUNDS = 10;
const TIME_AFTER_ROUND = 2;
const DELAY_PER_DELTA_MULT = 0.002;

// Initialize Express and WebSocket server
const app = express();
const server = require('http').createServer(app);
const wss = new WebSocket.Server({ server });

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Shared game state
let currentMultiplier = 1.0;
let totalMultiplier = 1.0;
let isGameRunning = false;
const clients = new Map(); // To track individual player states

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
        await sleep(TIME_PER_ROUNDS * 1000);

        // Start round
        isGameRunning = true;
        broadcast({ action: 'ROUND_STARTED' });

        let crashed = false;

        // Increment multiplier
        while (currentMultiplier < totalMultiplier) {
            currentMultiplier += 0.01;
            broadcast({ action: 'CNT_MULTIPLY', multiplier: currentMultiplier.toFixed(2) });
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