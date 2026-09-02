
const payBtn = document.querySelector("#payBtn")
let itemName = { 'itemName': 'apple' };
 

const userName = document.querySelector('#userName') ;
const userRollNumber   =document.querySelector('#userRollNumber')  ;
const userEvent =document.querySelector('#userEvent') ;
const userMail  =document.querySelector('#userMail') ;

//post request for  payment
payBtn.addEventListener('click', async () => {

     if(userName.value && userEvent.value && userMail.value && userRollNumber.value ){
        userInfo = {
            userName : userName.value,
            userRollNumber : userRollNumber.value,
            userEvent : userEvent.value,
            userMail : userMail.value
        }
        console.log(userInfo)
  


    let options = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(userInfo)
        
    }
    console.log(userInfo)

    let data = await fetch('/item-checkout', options);
    let response = await data.json();

    if (!response.success) {
        alert("could not process order")
        return;
    }
    

    //razorpay  
    const razorpayOptions = {
        key: response.keyId,
        amount: response.amount,
        currency: "INR",
        description: "register for" + userEvent.value,
        order_id: response.orderId,
        handler: async function (paymentResults) {
            console.log('payment-proof received : ', paymentResults)

            const verifyResponse = await fetch('/verify_payments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json'},
                body: JSON.stringify({
                    razorpay_order_id: paymentResults.razorpay_order_id,
                    razorpay_payment_id: paymentResults.razorpay_payment_id,
                    razorpay_signature: paymentResults.razorpay_signature,
                    itemName: itemName.itemName
                })
            })

            const verifyResult = await verifyResponse.json();
            if (verifyResult.success) {
                alert("successfuly paid the payment.")
                window.location.href = `/download-ticket/${paymentResults.razorpay_order_id}`
            } else {
                alert("payment verification failed")
            }

        },
        theme: { color: "#3399cc" }
    };
    const paymentWindow = new Razorpay(razorpayOptions);
    paymentWindow.open();

    console.log(response)

     }

})


payBtn.addEventListener("click" , async (e)=>{
    e.preventDefault();
     if(userName.value && userEvent.value && userMail.value && userRollNumber.value ){
        userInfo = {
            userName : userName.value,
            userRollNumber : userRollNumber.value,
            userEvent : userEvent.value,
            userMail : userMail.value
        }
        console.log(userInfo)
        let options = {
            method : 'POST',
            headers : {
                'Content-Type' : 'application/json'
            },
            body :  JSON.stringify(userInfo)
        }

        let data = await fetch('/userData', options)
        let response = await data.json();
        console.log(response);
     }
})

