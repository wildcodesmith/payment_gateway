import mongoose from 'mongoose';

const itemSchema = new mongoose.Schema({
    itemName: {type : String},
    itemPrice : {type : Number}

})

const ITEM_PRICE = mongoose.model("item_price", itemSchema);
export default ITEM_PRICE;