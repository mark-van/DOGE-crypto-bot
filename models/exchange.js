const mongoose = require('mongoose');
const Schema = mongoose.Schema;


const exchangeSchema = new Schema ({
    transfer: {
        type: String,
        enum: ['buy','sell']   //call only input one of theses values
    },
    fills: {
        price: Number,//should theses be strings?
        qty: Number,
        commission: Number,
        commissionAsset: String
    }
});

const Exchange = mongoose.model('Exchange', exchangeSchema);

module.exports = Exchange;