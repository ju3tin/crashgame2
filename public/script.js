const ws = new WebSocket('ws://localhost:3004');

let balance = 100;
let currentMultiplier = 1.0;

ws.onopen = () => console.log('Connected to server');
ws.onmessage = (event) => {
    const data = JSON.parse(event.data);

    switch (data.action) {
        case 'CNT_MULTIPLY':
            currentMultiplier = data.multiplier;
            document.getElementById('multiplier').innerText = `Multiplier: x${currentMultiplier}`;
            break;

        case 'CNT_BALANCE':
            balance = parseFloat(data.balance);
            document.getElementById('balance').innerText = `Balance: $${balance.toFixed(2)}`;
            break;

        case 'WON':
            alert(`You cashed out! Multiplier: x${data.mult}`);
            break;

        case 'LOST':
            alert('You lost!');
            break;

        case 'ROUND_PREPARING':
            alert('Round is preparing...');
            break;

        case 'ROUND_STARTED':
            alert('Round started!');
            break;

        case 'ROUND_CRASHED':
            alert(`Game crashed at x${data.multiplier}`);
            break;

        default:
            console.log('Unknown action:', data.action);
    }
};

document.getElementById('placeBet').onclick = () => {
    const betAmount = parseFloat(document.getElementById('betAmount').value);
    if (betAmount > 0 && betAmount <= balance) {
        ws.send(JSON.stringify({ action: 'BTN_BET_CLICKED', bet: betAmount }));
    } else {
        alert('Invalid bet amount');
    }
};

document.getElementById('cashOut').onclick = () => {
    ws.send(JSON.stringify({ action: 'BTN_BET_CLICKED' }));
};