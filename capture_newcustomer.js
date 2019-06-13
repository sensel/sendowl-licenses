
require('dotenv').config();
let crypto = require('crypto');
const nodemailer = require('nodemailer');
const express = require('express');
//handle POST from shopify webhook
const bodyParser = require('body-parser');
let getRawBody = require('raw-body')
let fs = require('fs');
const path = require('path');
const SERVER_PORT = process.env.PORT || 5000;
//set in heroku https://devcenter.heroku.com/articles/config-vars using https://www.sendowl.com/settings/api_credentials
let SOKEY = process.env.SO_KEY;
let SOSECRET = process.env.SO_SECRET;
const SHOPSECRET = process.env.SHOPIFY_SHARED_SECRET;
//only set locally
const ISLOCAL = process.env.LOCAL;
const EMAIL = process.env.EMAIL_USER;
const EPASS = process.env.EMAIL_PASS;
const GMAIL = process.env.GMAIL_USER;
const GPASS = process.env.GMAIL_PASS;
const RUNTEST = 0;


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
    from: '"New Customer" <peter@sensel.com>', // sender address
    to: 'p@nbor.us', // list of receivers
    subject: 'From Node App', // Subject line
    text: 'Hello world', // plain text body
};

async function sendEmail(data){
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

async function process_webhook(req, res) {
  console.log('New customer incoming...');
  for(let i in req){
    //console.log(`i: ${i}`);
  }
  console.log(`----------------------------`)
  console.log(`--rawbody: ${req.rawbody}`)
  // We'll compare the hmac to our own hash
  const hmac = req.get('X-Shopify-Hmac-Sha256');
  console.log(`hmac: ${hmac}`);
  // Use raw-body to get the body (buffer)
  const body = JSON.stringify(req.body);
  // Create a hash using the body and our key
  const hash = crypto
    .createHmac('sha256', SHOPSECRET)
    .update(req.rawbody, 'utf8', 'hex')
    .digest('base64');

  // Compare our hash to Shopify's hash
  if (hash === hmac) {
    // It's a match! All good
    console.log('Success, request came from Shopify!');
    var json = JSON.stringify(req.body);
    console.log(`note field ${req.body}`);
    //extract the serial and store from the note field
    var sn_regex = /\nSerialNumber\: (.*)/;
    var store_regex = /StorePurchased\: (.*)/;
    var sn = req.body.note.match(sn_regex)[1];
    var store = req.body.note.match(store_regex)[1];
    console.log(`serial number ${sn}`);
    console.log(`bought at ${store}`);
    //send the JSON contents to email, because you can.
    // sendEmail(json);
    fs.writeFile('ShopifyExampleCustomer.txt', json, (err) => {
    // throws an error, you could also catch it here
    if (err) throw err;
    // success case, the file was saved
    console.log('Order JSON saved!');
});

    res.sendStatus(200);
  } else {
    // No match! This request didn't originate from Shopify
    console.log('Danger! Not from Shopify!');
    res.sendStatus(403);
  }
}

async function parseOrderInfo (req,res){
  let email = req.body.contact_email;
  console.log(`email fields ${req.body.customer.email} ${req.body.contact_email}`)
  //if app isn't live, send to me, not customer.
  if(ISLIVE==0){
    email = TESTMAIL;
  }
  const order_num = req.body.name;
  const first_name = req.body.customer.first_name;
  const last_name = req.body.customer.last_name;
  //when order is scanned, we store counts of auths to send out
  let auths_needed = {'bitwig_8ts':0, 'arturia_all':0};
// `-----done scanning order. need ${auths_needed.arturia_all} Artu
  console.log(`** Order # ${order_num} from: ${req.body.contact_email} name: ${first_name} ${last_name}`);

}

function main() {
  // create a server that listens for URLs with order info.
  express()
    .use(express.static(path.join(__dirname, 'public')))
    .use(bodyParser.json({
        type:'application/json',
        limit: '50mb',
        verify: function(req, res, buf) {
            if (req.url.startsWith('/')){
              req.rawbody = buf;
            }
        }
    })
    )
    .use(bodyParser.urlencoded({ extended: true }))

    .get('/', function(req, res) {
      console.log('get it');
      res.send('SENSEL').status(200);
    })

    .post('/shopify/webhook', async function(req, res){
      process_webhook(req,res)
    })
    .post('/', async function(req, res){
      process_webhook(req,res)
    })

    .listen(SERVER_PORT, () => console.log(`Sensel: We're listening on ${ SERVER_PORT }`));
}
main();
