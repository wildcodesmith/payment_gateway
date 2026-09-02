import express, { urlencoded } from 'express';
import 'dotenv/config';
import { fileURLToPath } from 'url';
import path from 'path';
import { dirname } from 'path';
import mongoose from 'mongoose';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import QRCode from 'qrcode';
import PDFDocument from 'pdfkit'



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


//razorpay 
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_TEST_KEY_ID,
    key_secret: process.env.RAZORPAY_TEST_KEY_SECRET
})

// Captures rawBody buffer required by Razorpay signature verification
app.use(express.json({
    verify: (req, res, buf) => {
        req.rawBody = buf;
    }
}));
app.use(express.static('public'))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

//handling item post request
app.post('/item-checkout', async (req, res) => {

    let item = await ITEM_PRICE.findOne({ 'itemName': req.body.userEvent })
    console.log(item)
    if (item && req.body.userName && req.body.userRollNumber && req.body.userEvent && req.body.userMail) {
        let itemPrice = item.itemPrice;

        try {
            const razorpayOptions = {
                amount: itemPrice * 100,
                currency: 'INR',
                receipt: `receipt_${Date.now()}`

            };

            const order = await razorpay.orders.create(razorpayOptions);

            await USER_ACCOUNT.create({
                userName: req.body.userName,
                userRollNumber: req.body.userRollNumber,
                userEvent: req.body.userEvent,
                userMail: req.body.userMail,
                isPaid: false,
                orderId: order.id,

            });

            res.json({
                success: true,
                orderId: order.id,
                amount: order.amount,
                keyId: process.env.RAZORPAY_TEST_KEY_ID
            })
        } catch (error) {
            console.log(error)
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

// payment verification post request by frontened
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

            try {
                let user = await USER_ACCOUNT.findOne({ orderId: razorpay_order_id });
                await user.updateOne({ isPaid: true, paymentId: razorpay_payment_id })
                return res.status(200).json({
                    success: true,
                    message: "Payment verified successfully"
                })
            } catch (error) {
                console.log(error)
                res.status(500).json({ "message": "internal server error" });
            }

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
app.post('/razorpay-webhook', async (req, res) => {
    const razorpaySignature = req.headers['x-razorpay-signature'];
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    console.log("heelo its freaking working")
    if (!razorpaySignature || !webhookSecret) {
        return res.status(400).send('Missing signature or secret');
    }

    // Validate signature using raw body buffer
    const isPaymentAuthentic = Razorpay.validateWebhookSignature(
        req.rawBody,
        razorpaySignature,
        webhookSecret
    );
    if (isPaymentAuthentic) {
        console.log('webhook verified! Authenticated message from the razorpay')
        if (req.body.event === 'payment.captured') {
            try {
                const paymentDetails = req.body.payload.payment.entity;
                const orderId = paymentDetails.order_id
                console.log(`payment successful for order: ${orderId}`);

                //mongo db update
                const updatedUserInfo = await USER_ACCOUNT.updateOne(
                    { orderId: orderId, isPaid: false },
                    { $set: { isPaid: true, paymentId: paymentDetails.id } }
                );
                console.log("database updated successfully", updatedUserInfo)
                return res.status(200).send('Webhook received successfully');
            } catch (error) {
                console.log(error);
                return res.status(500).json({ "message": "server error" })
            }

        }
    } else {
        // If signatures don't match 
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

app.get('/gateway', (req, res) => {
    res.sendFile(path.join(__dirname, 'gateway.html'))
})
app.listen(port, () => {
    console.log(`example port listening...`)
})

// download pdf ticket endpoint
app.get('/download-ticket/:orderId', async (req, res) => {
    try {
        const { orderId } = req.params;

        const user = await USER_ACCOUNT.findOne({ orderId: orderId })
        if (!user || !user.isPaid) {
            return res.status(400).send("ticket not available or payment pending.")
        }

        // qr code generation 
        const qrBuffer = await QRCode.toBuffer(user.orderId, { margin: 1, width: 200, color: { dark: '#000000', light: '#FFFFFF' } });

        // setting response header to force the browser to download pdf 
        res.setHeader('Content-Type', "application/pdf");
        res.setHeader('Content-Disposition', `attachment; filename=Ticket_{user.userRollNUmber}.pdf`)

        //creating pdf
        const doc = new PDFDocument({ size: 'A5', layout: 'portrait', margin: 20 });
        doc.pipe(res)

        //ticket design
        doc.rect(0, 0, 320, 70).fill('#0d1117');
        doc.fillColor('#00f2fe').fontSize(16).text('NITK TECHFEST 2026', 0 , 20 , {align : 'center'});
        doc.fillColor('#89b49e').fontSize(8).text('DIGITAL ENTRY PASS', 0 , 42, {align : 'center'});

        doc.rect(60, 90, 200, 200).fill('#f0f6fc');
        doc.image(qrBuffer, 60 , 90 , {width: 200});
        
        //USER DETAILS 
        const startY = 320;
        doc.rect(20, startY, 280, 180).fill('#f8fafc');

        doc.fillColor('#64748b').fontSize(8);
        
        // Name
        doc.text('ATTENDEE NAME', 35, startY + 12);
        doc.fillColor('#0f172a').fontSize(12).text(user.userName, 35, startY + 22);

        // Roll Number & Event (Side by Side)
        doc.fillColor('#64748b').fontSize(8).text('ROLL NUMBER', 35, startY + 45);
        doc.fillColor('#0f172a').fontSize(11).text(user.userRollNumber, 35, startY + 55);

        doc.fillColor('#64748b').fontSize(8).text('EVENT', 170, startY + 45);
        doc.fillColor('#0284c7').fontSize(11).text(user.userEvent, 170, startY + 55);

        // Email
        doc.fillColor('#64748b').fontSize(8).text('EMAIL ADDRESS', 35, startY + 80);
        doc.fillColor('#0f172a').fontSize(10).text(user.userMail, 35, startY + 90);

        // Order ID
        doc.fillColor('#64748b').fontSize(8).text('ORDER ID', 35, startY + 115);
        doc.fillColor('#475569').fontSize(9).text(user.orderId, 35, startY + 125);

        // Payment Verified Badge
        doc.rect(35, startY + 145, 250, 24).fill('#dcfce7');
        doc.fillColor('#15803d').fontSize(9).text('✓ PAYMENT VERIFIED & CONFIRMED', 35, startY + 152, { width: 250, align: 'center' });

        doc.end();

        
    } catch (error) {
        console.error("PDF GENERATION ERROR :" , error);
        res.status(500).send("Server Error. Error generating ticket")
    }
})