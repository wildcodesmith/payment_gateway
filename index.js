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

 const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailRegex.test(req.body.userMail)) {
    return res.status(400).json({ 'error': "invalid email format", status: 400 })
  }

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
    res.render(path.join(__dirname, 'views/form.ejs'))
})
// app.post('/userData', (req, res) => {

//     try {
//         // add logic to check the correct mail id 
//         if(req.body.userName && req.body.userRollNumber && req.body.userEvent && req.body.userMail){
//             USER_ACCOUNT.insertMany({
//                     userName : req.body.userName,
//             userRollNumber : req.body.userRollNumber,
//             userEvent : req.body.userEvent,
//             userMail : req.body.userMail,
//             isPaid : false
//             })

//         }
//     } catch (error) {
//         res.status(500).json({ message: 'internal server error', status: 500 })
//     }


// })

app.get('/gateway', (req, res) => {
    res.sendFile(path.join(__dirname, 'gateway.html'))
})
app.listen(port, () => {
    console.log(`example port listening...`)
})

// download pdf ticket endpoint
// download pdf ticket endpoint
app.get('/download-ticket/:orderId', async (req, res) => {
    try {
        const { orderId } = req.params;

        const user = await USER_ACCOUNT.findOne({ orderId: orderId });

        if (!user || !user.isPaid) {
            return res.status(400).send("ticket not available or payment pending.");
        }

        // QR code generation
        const qrBuffer = await QRCode.toBuffer(
            user.orderId,
            {
                margin: 1,
                width: 200,
                color: {
                    dark: '#000000',
                    light: '#FFFFFF'
                }
            }
        );

        // Setting response header
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader(
            'Content-Disposition',
            `attachment; filename=Ticket_${user.userRollNumber}.pdf`
        );

        // Creating PDF
        const doc = new PDFDocument({
            size: 'A5',
            layout: 'portrait',
            margin: 0
        });

        doc.pipe(res);

        // =====================================================
        // COLORS
        // =====================================================

        const bg = '#24272B';
        const panel = '#30343A';
        const darkPanel = '#181B1F';
        const white = '#F5F5F5';
        const muted = '#AEB4BA';
        const cyan = '#00E5FF';
        const cyanDark = '#087F91';
        const border = '#737A80';


        // =====================================================
        // BACKGROUND
        // =====================================================

        doc.rect(0, 0, 419.5, 595.3)
            .fill(bg);


        // =====================================================
        // OUTER SCI-FI FRAME
        // =====================================================

        doc.lineWidth(2)
            .strokeColor('#8A9095')
            .roundedRect(8, 8, 403, 579, 18)
            .stroke();

        doc.lineWidth(1)
            .strokeColor('#444A50')
            .roundedRect(14, 14, 391, 567, 14)
            .stroke();


        // =====================================================
        // TOP RIGHT HEADER / LOGO
        // =====================================================

        doc.roundedRect(220, 25, 170, 85, 12)
            .fill(darkPanel);

        doc.lineWidth(2)
            .strokeColor(border)
            .roundedRect(220, 25, 170, 85, 12)
            .stroke();

        // Futuristic logo
        doc.lineWidth(3)
            .strokeColor(cyan)
            .circle(305, 66, 22)
            .stroke();

        doc.lineWidth(2)
            .moveTo(270, 66)
            .lineTo(340, 66)
            .stroke();

        doc.moveTo(282, 55)
            .lineTo(328, 55)
            .stroke();

        doc.moveTo(282, 77)
            .lineTo(328, 77)
            .stroke();

        doc.fillColor(cyan)
            .circle(305, 66, 6)
            .fill();


        // =====================================================
        // LEFT QR PANEL
        // =====================================================

        doc.roundedRect(25, 25, 180, 285, 14)
            .fill(panel);

        doc.lineWidth(2)
            .strokeColor(border)
            .roundedRect(25, 25, 180, 285, 14)
            .stroke();

        // Inner light panel
        doc.roundedRect(36, 36, 158, 263, 8)
            .fill('#E8ECEE');

        // QR code
        doc.image(qrBuffer, 51, 65, {
            width: 128,
            height: 128
        });

        // QR label
        doc.fillColor('#15181B')
            .fontSize(9)
            .font('Helvetica-Bold')
            .text(
                'SCAN FOR VERIFICATION',
                43,
                205,
                {
                    width: 145,
                    align: 'center'
                }
            );

        // Decorative lines
        doc.lineWidth(1)
            .strokeColor('#697177');

        doc.moveTo(48, 235)
            .lineTo(182, 235)
            .stroke();

        doc.moveTo(48, 245)
            .lineTo(160, 245)
            .stroke();

        // QR module label
        doc.fillColor('#202428')
            .fontSize(7)
            .font('Helvetica')
            .text(
                'DIGITAL ACCESS CREDENTIAL',
                45,
                265,
                {
                    width: 140,
                    align: 'center'
                }
            );


        // =====================================================
        // ATTENDEE NAME
        // =====================================================

        doc.roundedRect(220, 125, 170, 48, 8)
            .fill(panel);

        doc.lineWidth(1)
            .strokeColor(border)
            .roundedRect(220, 125, 170, 48, 8)
            .stroke();

        doc.fillColor(muted)
            .fontSize(7)
            .font('Helvetica-Bold')
            .text(
                'ATTENDEE',
                235,
                135
            );

        doc.fillColor(white)
            .fontSize(14)
            .font('Helvetica-Bold')
            .text(
                user.userName,
                235,
                148,
                {
                    width: 140,
                    ellipsis: true
                }
            );


        // =====================================================
        // ROLL NUMBER
        // =====================================================

        doc.roundedRect(220, 182, 170, 40, 7)
            .fill('#E5E8EA');

        doc.lineWidth(1)
            .strokeColor(border)
            .roundedRect(220, 182, 170, 40, 7)
            .stroke();

        doc.fillColor('#22262A')
            .fontSize(7)
            .font('Helvetica-Bold')
            .text(
                'ROLL NUMBER',
                233,
                190
            );

        doc.fontSize(11)
            .font('Helvetica-Bold')
            .text(
                user.userRollNumber,
                233,
                201
            );


        // =====================================================
        // EVENT
        // =====================================================

        doc.roundedRect(220, 231, 170, 40, 7)
            .fill('#E5E8EA');

        doc.lineWidth(1)
            .strokeColor(border)
            .roundedRect(220, 231, 170, 40, 7)
            .stroke();

        doc.fillColor('#22262A')
            .fontSize(7)
            .font('Helvetica-Bold')
            .text(
                'EVENT',
                233,
                239
            );

        doc.fillColor(cyanDark)
            .fontSize(11)
            .font('Helvetica-Bold')
            .text(
                user.userEvent,
                233,
                250,
                {
                    width: 140,
                    ellipsis: true
                }
            );


        // =====================================================
        // LARGE ORDER / TICKET ID
        // =====================================================

        doc.roundedRect(25, 325, 365, 62, 10)
            .fill(darkPanel);

        doc.lineWidth(2)
            .strokeColor(border)
            .roundedRect(25, 325, 365, 62, 10)
            .stroke();

        doc.fillColor(white)
            .fontSize(15)
            .font('Helvetica-Bold')
            .text(
                user.orderId,
                42,
                348,
                {
                    width: 330,
                    align: 'center',
                    ellipsis: true
                }
            );


        // =====================================================
        // EMAIL
        // =====================================================

        doc.fillColor(muted)
            .fontSize(7)
            .font('Helvetica-Bold')
            .text(
                'EMAIL ADDRESS',
                35,
                405
            );

        doc.fillColor(white)
            .fontSize(10)
            .font('Helvetica')
            .text(
                user.userMail,
                35,
                418,
                {
                    width: 230,
                    ellipsis: true
                }
            );


        // =====================================================
        // PAYMENT VERIFIED
        // =====================================================

        doc.roundedRect(280, 400, 110, 42, 8)
            .fill('#17251D');

        doc.lineWidth(1)
            .strokeColor('#3D8A59')
            .roundedRect(280, 400, 110, 42, 8)
            .stroke();

        doc.fillColor('#66E08A')
            .fontSize(8)
            .font('Helvetica-Bold')
            .text(
                '✓ VERIFIED',
                280,
                415,
                {
                    width: 110,
                    align: 'center'
                }
            );


        // =====================================================
        // BARCODE
        // =====================================================

        const barcodeX = 35;
        const barcodeY = 470;
        const barcodeW = 245;
        const barcodeH = 55;

        doc.roundedRect(
            barcodeX - 5,
            barcodeY - 5,
            barcodeW + 10,
            barcodeH + 10,
            5
        ).fill('#F0F2F3');

        let x = barcodeX;

        for (let i = 0; i < user.orderId.length * 8; i++) {

            const charCode =
                user.orderId.charCodeAt(
                    i % user.orderId.length
                );

            const barWidth =
                ((charCode + i) % 3) + 1;

            if (i % 2 === 0) {

                doc.rect(
                    x,
                    barcodeY,
                    barWidth,
                    barcodeH
                ).fill('#111111');
            }

            x += barWidth + 1;

            if (x > barcodeX + barcodeW) {
                break;
            }
        }


        // =====================================================
        // FOOTER
        // =====================================================

        doc.fillColor(muted)
            .fontSize(7)
            .font('Helvetica')
            .text(
                `NITK ENGINEER 2026  •  ${user.userRollNumber}`,
                35,
                550,
                {
                    width: 350,
                    align: 'center'
                }
            );


        // =====================================================
        // DECORATIVE CORNERS
        // =====================================================

        doc.lineWidth(2)
            .strokeColor(cyan);

        // Top-left
        doc.moveTo(20, 45)
            .lineTo(20, 75)
            .stroke();

        doc.moveTo(20, 45)
            .lineTo(45, 45)
            .stroke();

        // Top-right
        doc.moveTo(399, 45)
            .lineTo(374, 45)
            .stroke();

        // Bottom-left
        doc.moveTo(20, 550)
            .lineTo(20, 525)
            .stroke();

        // Bottom-right
        doc.moveTo(399, 550)
            .lineTo(374, 550)
            .stroke();


        // Finish PDF
        doc.end();

    } catch (error) {

        console.error("PDF GENERATION ERROR :", error);

        res.status(500).send(
            "Server Error. Error generating ticket"
        );
    }
});