import mongoose from 'mongoose';

const accountSchema = new mongoose.Schema({
            userName :{type: String , required : true},
            userRollNumber : {type: String , required : true},
            userEvent : {type: String , required : true},
            userMail : {type: String , required : true},
            isPaid : {type : Boolean, default : false},
            orderId : {type : String, unique : true , sparse : true},
            paymentId : {type : String},
}, {timestamps: true})

const USER_ACCOUNT = mongoose.model("useraccounts", accountSchema);
export default USER_ACCOUNT;