require('dotenv').config();
//twilio
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const clientTwilio = require('twilio')(accountSid, authToken);

//const mongoose = require('mongoose');
const axios = require('axios');
const CryptoJS = require("crypto-js");
const SECRET_KEY = process.env.SECRET_KEY;
const APIKEY = process.env.APIKEY;
let P = -3.5; //24 HOUR % CHANGE at time of last purchase
let timestamp;
let post;
let partial;
let hashed;
let data;
let listenKey;
let type = 'sell'; //looking to buy or sell(intially looking to sell)
let trainingWheels = 10; //cap program at ten buys to prevent the worst casenareo of an infinte loop quickly depleting my funds
let first = 0;
/*
UPDATE USDT AND BTC WHEN RESTART PROGRAM
*/

let USDT = 0; //initially start with zero USDT in account
let BTC = 0.00012032; //5 CAD at time of purchase
const halfhourms = 30*60*1000;
const dayms = 24*60*60*1000;
const userDataStream = 'https://api.binance.com/api/v3/userDataStream';
//const Exchange = require('./models/exchange');
const WebSocketClient = require('websocket').client;
// mongoose.connect('mongodb://localhost:27017/cryptoBot', {useNewUrlParser: true, useUnifiedTopology: true})
//     .then(() => {
//         console.log("Mongo CONNECTION OPEN!!");
//     })
//     .catch(err => {
//         console.log("OK NO, Mongo connection ERROROR");
//         console.log(err);
//     });

const client = new WebSocketClient();
const clientUserData = new WebSocketClient();


//coin maket price stream
client.on('connectFailed', function(error) {
    console.log('Connect Error: ' + error.toString());
});

client.on('connect', function(connection) {
    console.log('WebSocket Client Connected');
    
    connection.on('error', function(error) {
        console.log("Connection Error: " + error.toString());
        errorSMS('market stream connection error');

    });
    connection.on('close', function() {
        console.log('echo-protocol Connection Closed');
    });
    connection.on('message', function(message) {
        let parsedP = JSON.parse(message.utf8Data).P;
        //console.log(`24 HOUR % CHANGE: ${parsedP}`);
        if (message.type === 'utf8') {
            if((type == 'sell') && (parsedP < P-0.5)){ //if price is going down sell
                sell();
                P = parsedP;
            }else if ((type == 'buy') && (parsedP > P+0.5)){ //if price is going up buy
                buy();
                P = parsedP;
            }
        }
    });
});


//user data stream
clientUserData.on('connectFailed', function(error) {
    console.log('Connect Error: ' + error.toString());
});

clientUserData.on('connect', function(connection) {
    console.log('WebSocket clientUserData Connected');

    connection.on('error', function(error) {
        console.log("Connection clientUserData Error: " + error.toString());
        errorSMS('user data stream connection error');
    });
    connection.on('close', function() {
        console.log('echo-protocol Connection clientUserData Closed');
    });
    connection.on('message', function(message) {
        if (message.type === 'utf8') {
            console.log("Received: '" + message.utf8Data + "'");
            let parsed = JSON.parse(message.utf8Data);
            console.log(parsed.e);
            console.log(parsed.B);
            if(parsed.e == "outboundAccountPosition"){
                //update change in balances
                updateBalance(parsed.B);
            }
        }
    });
});

//update balance fro sync
function updateBalanceSync (arr) {
    arr.forEach(coin => {
        console.log(coin);
        if(coin.coin == 'BTC')
            BTC = coin.free;
        if(coin.coin == 'USDT')
            USDT = coin.free;
    });
    console.log(`Current USDT: ${USDT}`);
    console.log(`Current BTC: ${BTC}`);
};
//update balance after transactions
function updateBalance (arr) {
    arr.forEach(coin => {
        console.log(coin);
        if(coin.a == 'BTC')
            BTC = coin.f;
        if(coin.a == 'USDT')
            USDT = coin.f;
    });
    console.log(`Current USDT: ${USDT}`);
    console.log(`Current BTC: ${BTC}`);
};


//sell 
const sell = async () => {
    console.log('selling');
    type = 'buy';
    const config = {headers: {'X-MBX-APIKEY': `${APIKEY}`}}
    try {
        let res = await axios.get('https://api.binance.com/api/v1/time')
        timestamp = res.data.serverTime;
        console.log(Math.floor(BTC*100000)/100000);
        partial = `symbol=BTCUSDT&side=SELL&type=MARKET&quantity=${Math.floor(BTC*100000)/100000}&recvWindow=50000&timestamp=${timestamp}`;
        hashed = CryptoJS.HmacSHA256(partial, `${SECRET_KEY}`).toString(CryptoJS.enc.Hex);
        post = `https://api.binance.com/api/v3/order`;
        data = `${partial}&signature=${hashed}`;
        res = await axios.post(post,data,config);
        console.log(res.data);
        //save each transaction in database
        // const newExchange = new Exchange({transfer: 'sell', fills: res.data.fills});
        // await newExchange.save();
    } catch (e){
        console.log("ERROR at sell", e);
        errorSMS('sell');
    }
}
//buy the maximum amount of bitcoin given current quantity of USDT 
const buy = async () => {
    if(trainingWheels<=0){
        errorSMS('completed ten buys');
        return;
    }
    trainingWheels--;
    console.log('buying');
    type = 'sell';
    const config = {headers: {'X-MBX-APIKEY': `${APIKEY}`}}
    try {
        let res = await axios.get('https://api.binance.com/api/v1/time')
        timestamp = res.data.serverTime;
        console.log(timestamp);
        partial = `symbol=BTCUSDT&side=BUY&type=MARKET&quoteOrderQty=${USDT}&recvWindow=50000&timestamp=${timestamp}`;
        hashed = CryptoJS.HmacSHA256(partial, `${SECRET_KEY}`).toString(CryptoJS.enc.Hex);
        console.log(hashed);
        post = `https://api.binance.com/api/v3/order`;
        data = `${partial}&signature=${hashed}`;
        console.log(post);
        res = await axios.post(post,data,config);
        console.log(res.data);
        //save each transaction in database
        // const newExchange = new Exchange({transfer: 'buy', fills: res.data.fills});
        // await newExchange.save();
        setInterval(() => P>=0?P=P:P=0,dayms);// if P has been negative for a whole day sell
    } catch (e){
        console.log("ERROR at buy", e);
        errorSMS('buy');
    }
}
//ok, now lets set up buy and view current coins
const syncronizeData = async () => {
    const config = {headers: {'X-MBX-APIKEY': `${APIKEY}`}}
    try {
        let res = await axios.get('https://api.binance.com/api/v1/time')
        timestamp = res.data.serverTime;
        console.log(timestamp);
        partial = `timestamp=${timestamp}`;
        hashed = CryptoJS.HmacSHA256(partial, `${SECRET_KEY}`).toString(CryptoJS.enc.Hex);
        console.log(hashed);
        post = `https://api.binance.com/sapi/v1/capital/config/getall?${partial}&signature=${hashed}`;
        res = await axios.get(post,config);
        let arrCoins = res.data;
        arrCoins = arrCoins.filter(coin => coin.free != 0); //ok this works can used it to reset data at days end
        updateBalanceSync(arrCoins);
    } catch (e){
        console.log("ERROR at syncronizeData", e);
        errorSMS('syncronizeData');
    }
}
const deleteListenKey = async () => {
    const config = {headers: {'X-MBX-APIKEY': `${APIKEY}`}}
    try {
        post = userDataStream;
        console.log(post);
        res = await axios.delete(post,config);
        console.log(res.data);
        listenKey = '';
    } catch (e){
        console.log("ERROR at deleteListenKey", e);
        errorSMS('deleteListenKey');
    }
}
const getListenKey = async () => {
    const config = {headers: {'X-MBX-APIKEY': `${APIKEY}`}}
    try {
        post = userDataStream;
        console.log(post);
        res = await axios.post(post,null,config);
        console.log(res.data);
        listenKey = res.data.listenKey;
    } catch (e){
        console.log("ERROR at listenKey", e);
        errorSMS('listenKey');
    }
}

const pingUserData = async () => {
    const config = {headers: {'X-MBX-APIKEY': `${APIKEY}`}}
    try {
        post = userDataStream;
        console.log(post);
        res = await axios.put(post,null,config);
        console.log(res.data);
    } catch (e){
        console.log("ERROR at pingUserData", e);
        errorSMS('pingUserData');
    }

}
const connectToUserData = async () => {
    if(first != 0)
        deleteListenKey();
    else
        first = 1;
    getListenKey();
    clientUserData.connect(`wss://stream.binance.com:9443/ws/${listenKey}`);
}
const connectToMarket = async () => {
    client.connect('wss://stream.binance.com:9443/ws/btcusdt@ticker');
}

const errorSMS = (errorLocation) => {
    clientTwilio.messages
    .create({
        body: `Error at ${errorLocation}`,
        from: '+17788002773',
        to: '+17789790853'
    })
    .then(message => console.log('sent error SMS'));
}


connectToUserData();
setInterval(connectToUserData, dayms/2); //have to reconnect to stream every 24 hours(lets to 12 hours to be safe)
setInterval(pingUserData, halfhourms); // need to ping UD stream every hour(so lets to half hour to be safe)

connectToMarket();
setInterval(connectToMarket, dayms/2);
//setInterval(client.ping(), 3*60*1000) //need to ping market every 3 minuts //assume this si automatic

setInterval(syncronizeData, dayms); //Once a day, synchronize the bots coin value and the value in the account(checks for discrepancies)