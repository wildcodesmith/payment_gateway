import express, { urlencoded } from 'express';
import 'dotenv/config';
import { fileURLToPath } from 'url';
import path from 'path';
import { dirname } from 'path';
import mongoose from 'mongoose';
import Razorpay from 'razorpay';
import crypto from 'crypto';


const app = express();
const port = process.env.PORT;
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const dbURL = process.env.DBURL;

//database
mongoose.connect(dbURL)
    .then(() => {
        console.log("database connected successfully.")
    })
    .catch((error) => {
        console.log("database connection failed", error)
    })
import ITEM_PRICE from './model/item-price.js';
import USER_ACCOUNT from './model/userAccounts.js';

let a = await ITEM_PRICE.findOne({ itemName: "banana" })
console.log(a)

//razorpay 
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_TEST_KEY_ID,
    key_secret: process.env.RAZORPAY_TEST_KEY_SECRET
})

app.use(express.static('public'))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

//handling item post request
app.post('/item-checkout', async (req, res) => {

    let itemCheckout = req.body
    console.log(itemCheckout)
    let item = await ITEM_PRICE.findOne({ 'itemName': req.body.itemName })
    if (item) {
        let itemPrice = item.itemPrice;

        try {
            const razorpayOptions = {
                amount: itemPrice * 100,
                currency: 'INR',
                receipt: `receipt_${Date.now()}`

            };

            const order = await razorpay.orders.create(razorpayOptions);
            res.json({
                success: true,
                orderId: order.id,
                amount: order.amount,
                keyId: process.env.RAZORPAY_TEST_KEY_ID
            })
        } catch (error) {
            res
                .status(500)
                .json({ 'message': 'internal server error', status: 500 })
        }
    } else {
        console.log('item not found')
        res
            .status(400)
            .json({ 'error': 'item not found', status: 400 })
    }

})

//payment verification post request by frontened
app.post('/verify_payments', async (req, res) => {
    try {
        console.log(req.body.userName)
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, itemName } = req.body;
        //generating expected signature 
        const body = razorpay_order_id + '|' + razorpay_payment_id;
        const expectedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_TEST_KEY_SECRET)
            .update(body.toString())
            .digest('hex');

        //comparing signature
        let isPaymentAuthentic = false;
        const expectedBuffer = Buffer.from(expectedSignature, 'hex');
        const razorpayBuffer = Buffer.from(razorpay_signature, 'hex');
        if (expectedBuffer.length === razorpayBuffer.length) {
            isPaymentAuthentic = crypto.timingSafeEqual(expectedBuffer, razorpayBuffer)
        }
        if (isPaymentAuthentic) {
            console.log(`payment authentic for order : ${razorpay_order_id}`);

            return res.status(200).json({
                success: true,
                message: "Payment verified successfully"
            })
        } else {
            console.log('signature mismatch! fake payment attempt')
            return res.status(400).json({
                success: false,
                message: "Payment verification failed. Invalid Signature"
            })
        }

    } catch (error) {
        console.error("verification error ", error)
        res.status(500).json({ success: false, message: "Internal server Error" })
    }
})
//payment verification by razorpay to the server
app.post('/razorpay-webhook', (req, res) => {
    const razorpaySignature = req.headers['x-razorpay-signature'];
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

    const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(JSON.stringify(req.body))
        .digest('hex')
    let isPaymentAuthentic = false;
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');
    const razorpayBuffer = Buffer.from(razorpaySignature, 'hex')
    if (expectedBuffer.length === razorpayBuffer.length) {
        isPaymentAuthentic = crypto.timingSafeEqual(expectedBuffer, razorpayBuffer)

    }
    if (isPaymentAuthentic) {
        console.log('webhook verified! Authenticated message from the razorpay')
        if (req.body.event === 'payment.captured') {
            const paymentDetails = req.body.payload.payment.entity;
            const orderId = paymentDetails.order_id
            console.log(`payment successful for order: ${orderId}`);

            //mongo db update

            return res.status(200).send('Webhook received successfully');
        }
    } else {
        // If signatures don't match, an attacker might be trying to fake a webhook!
        console.log('Webhook signature mismatch! Fake payload detected.');
        return res.status(400).send('Invalid signature');
    }
})

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'))
})

app.get('/form', (req, res) => {
    res.sendFile(path.join(__dirname, 'form.html'))
})
app.post('/userData', (req, res) => {

    try {
        // add logic to check the correct mail id 
        if(req.body.userName && req.body.userRollNumber && req.body.userEvent && req.body.userMail){
            USER_ACCOUNT.insertMany({
                    userName : req.body.userName,
            userRollNumber : req.body.userRollNumber,
            userEvent : req.body.userEvent,
            userMail : req.body.userMail,
            isPaid : false
            })
            
        }
    } catch (error) {
        res.status(500).json({ message: 'internal server error', status: 500 })
    }


})

app.get('/gateway' , (req, res) =>{
    res.sendFile(path.join(__dirname , 'gateway.html'))
})
app.listen(port, () => {
    console.log(`example port listening...`)
})  