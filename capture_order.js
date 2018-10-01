
require('dotenv').config();
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const express = require('express');
//handle POST from shopify webhook
const bodyParser = require('body-parser');
const path = require('path');
let fs = require('fs');
let ejs = require('ejs');

let SERVER_PORT = process.env.PORT || 5000;
//set in heroku https://devcenter.heroku.com/articles/config-vars using https://www.sendowl.com/settings/api_credentials
let SOKEY = process.env.SO_KEY;
let SOSECRET = process.env.SO_SECRET;
const SHOPSECRET = process.env.SHOPIFY_SHARED_SECRET;
//only set locally
const ISLOCAL = process.env.LOCAL;
const GMAIL = process.env.GMAIL_USER;
const GPASS = process.env.GMAIL_PASS;



///SETUP Email service
///with google
const gmail_transporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
        user: GMAIL,
        pass: GPASS
    }
});

// setup email data
const gmailOptions = {
    from: '"Sensel - Your Free Software" <peter@sensel.com>', // sender address
    to: 'p@nbor.us', // list of receivers
    subject: 'From Node App', // Subject line
    text: 'Hello world', // plain text body
};

function sendEmail(data){
  gmailOptions.text = data;
  console.log("======================>");
  gmail_transporter.sendMail(gmailOptions, function (err, info) {
      if (err) {
          console.log(err);
      } else {
          console.log('Message sent: ' + info.response);
      }
  });
}


function main() {
  // create a server that listens for URLs with order info.
  express()
    .use(express.static(path.join(__dirname, 'public')))
    .use(bodyParser.json({
        type:'application/json',
        limit: '50mb',
        verify: function(req, res, buf) {
            if (req.url.startsWith('/shopify')){
              req.rawbody = buf;
            }
        }
    })
    )
    .use(bodyParser.urlencoded({ extended: true }))

    .get('/', function(req, res) {
      console.log('get it')
      res.send('SENSEL').status(200);
    })

    .post('/shopify/webhook', async function(req, res) {
      console.log('We got an order!')
      // We'll compare the hmac to our own hash
      const hmac = req.get('X-Shopify-Hmac-Sha256');
      // Use raw-body to get the body (buffer)
      //const body = JSON.stringify(req.body);
      // Create a hash using the body and our key
      const hash = crypto
        .createHmac('sha256', SHOPSECRET)
        .update(req.rawbody, 'utf8', 'hex')
        .digest('base64');

      // Compare our hash to Shopify's hash
      if (hash === hmac) {
        // It's a match! All good
        console.log('Phew, it came from Shopify!');

        var json = JSON.stringify(req.body);
        fs.writeFile('ShopifyOrder.json', json);
        sendEmail(json)

        res.sendStatus(200);
      } else {
        // No match! This request didn't originate from Shopify
        console.log('Danger! Not from Shopify!');
        res.sendStatus(403);
      }
    })

    .listen(SERVER_PORT, () => console.log(`We're listening on ${ SERVER_PORT }`));
}
main();
