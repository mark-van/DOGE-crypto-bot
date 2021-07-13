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
let type;
let baseEndpoint = 'https://api.binance.com';
let trainingWheels = parseFloat(process.env.MAX_BUYS); //cap program at ten buys to prevent the worst casenareo of an infinte loop quickly depleting my funds
let orderInprogress = 0; //is a sell or buy order currently being processed
let first = 0;
let P24ID = -1;  //interval id for 24 hour P variable interval function
let USDT;  //USDT in account
let DOGE;  //DOGE coin in account
const halfhourms = 30*60*1000;
const dayms = 24*60*60*1000;
const WebSocketClient = require('websocket').client;
const client = new WebSocketClient();

//coin maket stream
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

//update balance given array of assets in acoount. 
//throw an error if there is a discrpencacy and this is not the initalization of asset values
function updateBalance (arr) {
    arr.forEach(coin => {
        console.log(coin);
        if(coin.coin == 'DOGE'){
            if((typeof(DOGE)!='undefined') && (DOGE != coin.free))
		    throw new Error('Price Discrepancy: DOGE');
	    DOGE = coin.free;
	}
        else if(coin.coin == 'USDT'){
	    if((typeof(USDT)!='undefined') && (USDT != coin.free))
 		    throw new Error('Price Discrepancy: USDT');
            USDT = coin.free;
	}
    });
    console.log(`Current USDT: ${USDT}`);
    console.log(`Current DOGE: ${DOGE}`);
};

//sell maximum amount of DOGE coin for USDT
const sell = async () => {
    clearInterval(P24ID);
    console.log('selling');
    type = 'buy';
    console.log(`DOGE: ${DOGE}`);
    console.log(`USDT: ${USDT}`);
    const config = {headers: {'X-MBX-APIKEY': `${APIKEY}`}}
    try {
        let res = await axios.get(baseEndpoint + '/api/v1/time')
        timestamp = res.data.serverTime;
        console.log(Math.floor(DOGE));
        partial = `symbol=DOGEUSDT&side=SELL&type=MARKET&quantity=${Math.floor(DOGE)}&recvWindow=50000&timestamp=${timestamp}`;
        hashed = CryptoJS.HmacSHA256(partial, `${SECRET_KEY}`).toString(CryptoJS.enc.Hex);
        post = baseEndpoint + `/api/v3/order`;
        data = `${partial}&signature=${hashed}`;
        res = await axios.post(post,data,config);
        console.log(res.data);
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

//buy the maximum amount of DOGE coin given current quantity of USDT 
const buy = async () => {
    if(trainingWheels<=0){
        errorSMS('completed alloted buys');
	 throw new Error('completed alloted buys');
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
        let res = await axios.get(baseEndpoint + '/api/v1/time')
        timestamp = res.data.serverTime;
        console.log(timestamp);
        partial = `symbol=DOGEUSDT&side=BUY&type=MARKET&quoteOrderQty=${USDT}&recvWindow=50000&timestamp=${timestamp}`;
        hashed = CryptoJS.HmacSHA256(partial, `${SECRET_KEY}`).toString(CryptoJS.enc.Hex);
        console.log(hashed);
        post = baseEndpoint + `/api/v3/order`;
        data = `${partial}&signature=${hashed}`;
        console.log(post);
        res = await axios.post(post,data,config);
        console.log(res.data);
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

//checks if type, USDT and DOGE value are correct by requesting account data from binance.
//If there is  discrepinacy, an error is thrown
const syncronizeData = async () => {
    const config = {headers: {'X-MBX-APIKEY': `${APIKEY}`}}
    try {
        let res = await axios.get(baseEndpoint + '/api/v1/time')
        timestamp = res.data.serverTime;
        console.log(timestamp);
        partial = `recvWindow=50000&timestamp=${timestamp}`;
        hashed = CryptoJS.HmacSHA256(partial, `${SECRET_KEY}`).toString(CryptoJS.enc.Hex);
        console.log(hashed);
        post = baseEndpoint + `/sapi/v1/capital/config/getall?${partial}&signature=${hashed}`;
        res = await axios.get(post,config);
        let arrCoins = res.data;
        arrCoins = arrCoins.filter(coin => coin.free != 0); //ok this works can used it to reset data at days end
        updateBalance(arrCoins);
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

//connect to maket data stream
const connectToMarket = async () => {
    client.connect('wss://stream.binance.com:9443/ws/dogeusdt@ticker');
}

//send message to personal cell phone in the event of an error
const errorSMS = (errorLocation) => {
    clientTwilio.messages
    .create({
        body: `Error at ${errorLocation}`,
        from: '+1' + process.env.TWILIO_NUMBER,
        to: '+1' + process.env.PERSONAL_NUMBER
    })
    .then(message => console.log('sent error SMS'));
}

///24 HOUR % CHANGE is negative for a whole day, set it to zero
P24ID = setInterval(() => P<=0?P=P:P=0,dayms);

//set intial values for type USDT and DOGE
syncronizeData();

//setup iniital wesocket connection
connectToMarket();
setInterval(connectToMarket, dayms/2); //have to reconnect to stream every 24 hours(lets to 12 hours to be safe)
setInterval(syncronizeData, dayms); //Once a day, synchronize the bots coin value and the value in the account(checks for discrepancies)
