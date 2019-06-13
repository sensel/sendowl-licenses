
'use strict';
//for local environment variables in a '.env' file. not needed in heroku cloud
require('dotenv').config();
//for calculating signature from Shopify
const crypto = require('crypto');
//used for calculating signature to verify Shopify POST
let getRawBody = require('raw-body')
//makes sending email easy
const nodemailer = require('nodemailer');
//the server
const express = require('express');
//handle POST from shopify webhook
const bodyParser = require('body-parser');
//for making sure filepath is correct
const path = require('path');
//for reading files to test from
let fs = require('fs');
//database hooks
const MongoClient = require('mongodb').MongoClient;
//used for email templates
let ejs = require('ejs');

//environment VARS set in heroku https://devcenter.heroku.com/articles/config-vars
//or in local .env file

let SERVER_PORT = process.env.PORT || 5000;

//is the app listening to real orders from customers?
const ISLIVE = process.env.ISLIVE;
//should we use order data stored in JSON files instead of listening to shopify?
const RUNTEST = process.env.RUNTEST;
//for authorizing the POST as coming from Shopify servers:
const SHOPSECRET = process.env.SHOPIFY_SHARED_SECRET;
//only set this with local .env, not with heroku config
const ISLOCAL = process.env.LOCAL;
//email to use, depending on LIVE status

const GMAIL = process.env.GMAIL_USER; //me@sensel
const GPASS = process.env.GMAIL_PASS;
const SUSER = process.env.SUPPORT_USER; //support@
const SPASS = process.env.SUPPORT_PASS;
const NMAIL = process.env.EMAIL_USER; //alt email
const NPASS = process.env.EMAIL_PASS;
let EMAILUSER = GMAIL;
let EMAILPASS = GPASS;
//if this is live, we'll use the support@ email
if(ISLIVE==1){
  EMAILUSER = SUSER;
  EMAILPASS = SPASS;
}
let skunames = {"S4001":"Morph Music Maker's Bundle", "S0002":"No Overlay", "S4009":"Piano", "S4008":"Music Production", "S4010":"Drum Pad", "S4002":"Innovator's	", "S4007":"Video Editing", "S4011":"Gaming", "S4003":"QWERTY Keyboard", "S4004":"AZERTY Keyboard", "S4005":"DVORAK Keyboard", "S4013":"Morph with Buchla Thunder Overlay"}

const TESTMAIL = process.env.TESTMAIL; //when testing, don't send to customer, send to me
const ADMINMAIL = process.env.ADMINMAIL; //for warnings
//how many serials should be have left before we send out warning emails to admin?
const WARNING_COUNT = 50;
const dbName = process.env.MONGO_DBNAME

//just declare these variables, we'll fill them later
let dbBitwig;
let dbArturia;
let dbMorphSNs;


// run given doFunc inside a database transaction
async function dbDo(doFunc) {
  let client;
  let db;

  try {
    // Use connect method to connect to the Server
    client = await MongoClient.connect(process.env['MONGO_URI'], {useNewUrlParser: true});
    db = client.db(dbName);
  } catch (err) {
    console.log(err.stack);
  }

  if (client) {
    console.log('database client opened')
    try {
      await doFunc(db);
    } catch (err) {
      console.log(err.stack);
    }

    client.close();
  }
  else {
    console.log('failed to open database client')
  }
}

async function process_sn(req, res){
  let sn_exists = false;
  let sn_not_regd = false;

  //parse the request for the serial number to verify
  const sn = req.body.serialnumber;

  //check that the serial number is in our database
  let sn_docs = await dbArturia.find({ serial_number: sn });
  if(sn_docs){
    sn_exists = true;
  }
  //check that the serial number has not been registered
  if(sn_docs.email != ''){
    sn_not_regd = true;
  }
  //if both are ok, then respond with an OK
  if(sn_exists == true && sn_not_regd == true){
    res.send('Registration OK')
  }else{
  //else respond with an error the form can display
    if(sn_exists == false){
      res.send('Serial number invalid. Please double check or contact support@sensel.com');
    }
    if(sn_not_regd == false){
      res.send('Serial number is already registered. Please double check or contact support@sensel.com');
    }
  }
}

async function main() {
  await dbDo(async (db) => {
    dbMorphSNs = db.collection('morph-serials');
    //check the serial counts on start:
    // await check_counts();
});

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
      res.send('<a href="http://sensel.com">SENSEL</a>').status(200);
    })
    .post('/', async function(req, res) {
      console.log('generic post endpoint placeholder')
      // process_post(req,res);
    })
    .post('/shopify/webhook', async function(req, res) {
      console.log('shopify/webhook endpoint placeholder')
      //process_post(req,res);
    })
    .post('/verify_sn', async function(req, res) {
      process_sn(req,res);
    })

    .listen(SERVER_PORT, () => console.log(`We're listening on ${ SERVER_PORT }`));
}
main();
