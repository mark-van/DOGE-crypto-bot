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
let P = parseFloat(process.env.P); //24 HOUR % CHANGE at time of last purchase
let timestamp;
let post;
let partial;
let hashed;
let data;
let listenKey;
let type; // = process.env.TYPE; //looking to buy or sell(intially looking to sell)
let trainingWheels = parseFloat(process.env.MAX_BUYS); //cap program at ten buys to prevent the worst casenareo of an infinte loop quickly depleting my funds
let orderInprogress = 0; //is a sell or buy order currently being processed
let first = 0;
let P24ID = -1;  //interval id for 24 hour P variable interval function
/*
UPDATE USDT AND DOGE WHEN RESTART PROGRAM
*/

let USDT; // = parseFloat(process.env.USDT); //initially start with zero USDT in account
let DOGE; // = parseFloat(process.env.DOGE); //5 CAD at time of purchase
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
	    if(orderInprogress==0){
		if((type === 'sell') && (parsedP < P-0.5)){ //if price is going down sell
		    orderInprogress=1;
		    console.log(`Old P Before sell:${P}`);
		    console.log(`ParsedP Before sell ${parsedP}`);
		    sell();
		    console.log(`Old P Sell:${P}`);
		    P = parsedP;
		    console.log(`New P Sell:${P}`);
		}else if ((type === 'buy') && (parsedP > P+0.5)){ //if price is going up buy
		    orderInprogress=1;
		    console.log(`Old P Before Buy:${P}`);
		    console.log(`ParsedP Before Buy ${parsedP}`);
		    buy();
		    console.log(`Old P Buy:${P}`);
		    P = parsedP;
		    console.log(`New P Buy:${P}`);		
		}
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
        if(coin.coin == 'DOGE')
            DOGE = coin.free;
        if(coin.coin == 'USDT')
            USDT = coin.free;
    });
    console.log(`Current USDT: ${USDT}`);
    console.log(`Current DOGE: ${DOGE}`);
};
//update balance after transactions
function updateBalance (arr) {
    arr.forEach(coin => {
        console.log(coin);
        if(coin.a == 'DOGE')
            DOGE = coin.f;
        if(coin.a == 'USDT')
            USDT = coin.f;
    });
    console.log(`Current USDT: ${USDT}`);
    console.log(`Current DOGE: ${DOGE}`);
};


//sell 
const sell = async () => {
    clearInterval(P24ID);
    console.log('selling');
    type = 'buy';
    console.log(`DOGE: ${DOGE}`);
    console.log(`USDT: ${USDT}`);
    const config = {headers: {'X-MBX-APIKEY': `${APIKEY}`}}
    try {
        let res = await axios.get('https://api.binance.com/api/v1/time')
        timestamp = res.data.serverTime;
        console.log(Math.floor(DOGE));
        partial = `symbol=DOGEUSDT&side=SELL&type=MARKET&quantity=${Math.floor(DOGE)}&recvWindow=50000&timestamp=${timestamp}`;
        hashed = CryptoJS.HmacSHA256(partial, `${SECRET_KEY}`).toString(CryptoJS.enc.Hex);
        post = `https://api.binance.com/api/v3/order`;
        data = `${partial}&signature=${hashed}`;
        res = await axios.post(post,data,config);
        console.log(res.data);
        //save each transaction in database
        // const newExchange = new Exchange({transfer: 'sell', fills: res.data.fills});
        // await newExchange.save();
        P24ID = setInterval(() => P<=0?P=P:P=0,dayms); // if P has been positive for a whole day buy
	let fillsarr = res.data.fills;
	fillsarr.forEach(fill => {
	    USDT+=parseFloat(fill.price)*parseFloat(fill.qty)-parseFloat(fill.commission);
	});
	fillsarr.forEach(fill => {
	    DOGE-=parseFloat(fill.qty);
	});
	console.log(`DOGE: ${DOGE}`);
	console.log(`USDT: ${USDT}`);
	orderInprogress=0;
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
    clearInterval(P24ID);
    console.log('buying');
    type = 'sell';
    console.log(`DOGE: ${DOGE}`);
    console.log(`USDT: ${USDT}`);
    const config = {headers: {'X-MBX-APIKEY': `${APIKEY}`}}
    try {
        let res = await axios.get('https://api.binance.com/api/v1/time')
        timestamp = res.data.serverTime;
        console.log(timestamp);
        partial = `symbol=DOGEUSDT&side=BUY&type=MARKET&quoteOrderQty=${USDT}&recvWindow=50000&timestamp=${timestamp}`;
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
        P24ID = setInterval(() => P>=0?P=P:P=0,dayms);// if P has been negative for a whole day sell
	orderInprogress=0;
	let fillsarr = res.data.fills;
	fillsarr.forEach(fill => {
	    USDT-=parseFloat(fill.price)*parseFloat(fill.qty);
	});
	fillsarr.forEach(fill => {
	    DOGE+=parseFloat(fill.qty)-parseFloat(fill.commission);
	});
	console.log(`DOGE: ${DOGE}`);
	console.log(`USDT: ${USDT}`);
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
        partial = `recvWindow=50000&timestamp=${timestamp}`;
        hashed = CryptoJS.HmacSHA256(partial, `${SECRET_KEY}`).toString(CryptoJS.enc.Hex);
        console.log(hashed);
        post = `https://api.binance.com/sapi/v1/capital/config/getall?${partial}&signature=${hashed}`;
        res = await axios.get(post,config);
        let arrCoins = res.data;
        arrCoins = arrCoins.filter(coin => coin.free != 0); //ok this works can used it to reset data at days end
        updateBalanceSync(arrCoins);
	if(USDT>DOGE){
	    type='buy';
	}
	else{
	    type='sell';
	}
	console.log(type);
    } catch (e){
        console.log("ERROR at syncronizeData", e);
        errorSMS('syncronizeData');
    }
}
const deleteListenKey = async () => {
    const config = {headers: {'X-MBX-APIKEY': `${APIKEY}`}}
    try {
        post = userDataStream +`?listenKey=${listenKey}`;
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
        post = userDataStream +`?listenKey=${listenKey}`;
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
    client.connect('wss://stream.binance.com:9443/ws/dogeusdt@ticker');
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

P24ID = setInterval(() => P<=0?P=P:P=0,dayms);

//connectToUserData();
//setInterval(connectToUserData, dayms/2); //have to reconnect to stream every 24 hours(lets to 12 hours to be safe)
//setInterval(pingUserData, halfhourms); // need to ping UD stream every hour(so lets to half hour to be safe)
//set USDT and DOGE value
syncronizeData();

connectToMarket();
setInterval(connectToMarket, dayms/2);
//setInterval(client.ping(), 3*60*1000) //need to ping market every 3 minuts //assume this si automatic

setInterval(syncronizeData, dayms); //Once a day, synchronize the bots coin value and the value in the account(checks for discrepancies)
