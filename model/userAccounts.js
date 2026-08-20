import mongoose from 'mongoose';

const accountSchema = new mongoose.Schema({
            userName :{type: String , require : true},
            userRollNumber : {type: String , require : true},
            userEvent : {type: String , require : true},
            userMail : {type: String , require : true},
            isPaid : {type : Boolean}
})

const USER_ACCOUNT = mongoose.model("useraccounts", accountSchema);
export default USER_ACCOUNT;