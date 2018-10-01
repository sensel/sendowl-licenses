//TO DO:
//soft_auths needs to be changed to handle multiple licenses as needed from parseOrder results
//need to incorporate the actual email system
//figure out major failures - check for failures and email me if it happens
//collect the order data from Shopify for testing
//need to initialize the database in herokuapp
//  put heroku in maintenace mode
//  then run the init db using the heroku command line tool (heroku run, exec, or task)
//    --heroku run 'node db/init.js' -a polar-sands-88575
//  then switch from maintenance to live.

// app is at https://polar-sands-88575.herokuapp.com/ https://git.heroku.com/polar-sands-88575.git

'use strict';

require('dotenv').config();
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const express = require('express');
//handle POST from shopify webhook
const bodyParser = require('body-parser');
const path = require('path');
const MongoClient = require('mongodb').MongoClient;
let ejs = require('ejs');
let getRawBody = require('raw-body')
let fs = require('fs');

let SERVER_PORT = process.env.PORT || 5000;
//set in heroku https://devcenter.heroku.com/articles/config-vars using https://www.sendowl.com/settings/api_credentials
let SOKEY = process.env.SO_KEY;
let SOSECRET = process.env.SO_SECRET;
const SHOPSECRET = process.env.SHOPIFY_SHARED_SECRET;
//only set locally
const ISLOCAL = process.env.LOCAL;
const GMAIL = process.env.GMAIL_USER;
const GPASS = process.env.GMAIL_PASS;

const dbName = 'heroku_z503k0d1';
let dbBitwig;
let dbArturia;

//read a json file that is the same format as a post from Shopify webhook
// let testOrder = JSON.parse(fs.readFileSync('testorder.json', 'utf8'));
let testOrder;
fs.readFile('testorder.json', 'utf8', function (err, data) {
  if (err) throw err;
  testOrder = JSON.parse(data);
});

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
    console.log('client opened')
    try {
      await doFunc(db);
    } catch (err) {
      console.log(err.stack);
    }

    client.close();
  }
  else {
    console.log('failed to open client')
  }
}

//get the order info from Shopify and grab all the interesting bits.
async function parseOrderInfo (req,res){
  const email = req.body.contact_email;
  const order_num = req.body.name;
  const first_name = req.body.customer.first_name;
  const last_name = req.body.customer.last_name;
  //when order is scanned, we store counts of auths to send out
  let auths_needed = {'bitwig_8ts':0, 'arturia_all':0};

  //scan thru order and count the number of auths we'll need.
  //then, after scanning pass thru a function that gets all the auths
  for (let i in req.body.line_items){
    const title = req.body.line_items[i]['title'];
    const variant = req.body.line_items[i]['variant_title'];

    console.log('++   Cart Item '+i+': '+title+' w/ '+variant);

    if(title == 'The Sensel Morph with 1 Overlay'){
      if(variant=='Music Production' || variant=='Piano' || variant=='Drum Pad' || variant=="Innovator's"){
        //provide Arturia and Bitwig code
        auths_needed.bitwig_8ts = auths_needed.bitwig_8ts + 1;
        auths_needed.arturia_all = auths_needed.arturia_all + 1;
      }else{
        //provide only Arturia
        auths_needed.arturia_all = auths_needed.arturia_all + 1;
      }
    }
    if(title == "Morph Music Maker's Bundle"){
      //provide Arturia and Bitwig Codes
      auths_needed.bitwig_8ts = auths_needed.bitwig_8ts + 1;
      auths_needed.arturia_all = auths_needed.arturia_all + 1;
    }
    //using test products:
    if(title == 'SenselTest'){
      console.log('SENSEL TEST PRODUCT');
      if(variant=="Innovator's"){
        console.log('INNOVATOR OVERLAY VARIANT');
        auths_needed.arturia_all = auths_needed.arturia_all ++;
      }
      if(variant=="Piano"){
        console.log('PIANO VARIANT');
        auths_needed.bitwig_8ts = auths_needed.bitwig_8ts ++;
        auths_needed.arturia_all = auths_needed.arturia_all ++;
      }
    }
  }
  console.log(`-----done scanning order. need ${auths_needed.arturia_all} Arturia licenses and ${auths_needed.bitwig_8ts} Bitwig licenses----`);
  //now go through db and get the auth keys as needed
  let auth_cart = await soft_auths(req,auths_needed);
  //email the contents of cart to customer
  await sendTemplate(auth_cart);

}

async function noauths_avail(v){
  //email peter@sensel.com and mark@sensel.com
}

//soft_auths is for POST requests direct from Shopify webhook
//lots of nested functions due relying on callbacks. I'm sure there's a nice way to do this, but this works.
async function soft_auths(req,auth){
  console.log(`>> getting authorizations for Arturia: ${auth.arturia_all} and Bitwig: ${auth.bitwig_8ts} <<`);
  // auth.bitwig_8ts is number of bitwig licenses we need to deliver
  // auth.arturia_all is number of arturia licenses we need to deliver
  let cart = {'arturia_all':[],'bitwig_8ts':[]};
  // find the first record where there is no order ID ('lic_docs'), get the license info,
  // then update entry with the new info
  //returns an array of license info. Entry 0 is Arturia, entry 1 is Bitwig.
  let lic_docs = await dbArturia.find({ order_id: '' }).limit(auth.arturia_all);
  for (let doc = await lic_docs.next(); doc != null; doc = await lic_docs.next()) {
      console.log(`SERIALS: ${doc.serial}`);
    }

  lic_docs = await lic_docs.toArray();
  console.log(`found: ${lic_docs.length} auths in the Arturia Database.`);
  for(let i in lic_docs){
    console.log(`docs: ${i} - ${lic_docs[i]}`);
    for(let j in lic_docs[i]){
      console.log(`j docs: ${j} - ${lic_docs[j]}`);
    }
  }

  let art_cart = [[],[]];

  if(lic_docs.length===auth.arturia_all){
    let j = 0;
    for(let i of lic_docs){
      art_cart[j] = [lic_docs[i].serial,lic_docs[i].unlock_code];
      await update_db(req,lic_docs[i]._id,dbArturia);
      console.log(`++ Arturia sn and unlock are ${art_cart[j][0]} | ${art_cart[j][1]}`);
    }
  }else{
    console.log('Need More Arturia Serial Numbers and Unlock Codes');
    art_cart[0] = 'contact support@sensel.com for your Arturia license';
  }

  //find the bitwig auths
  lic_docs = await dbBitwig.find({ order_id: '' }).limit(auth.bitwig_8ts);
  lic_docs = await lic_docs.toArray();
  console.log(`found: ${lic_docs.length} auths in the Bitwig Database.`);
  console.log(`docs: ${lic_docs}`);

  let bw_cart = [];

  if(lic_docs.length===auth.bitwig_8ts){
    let j = 0;
    for(let i in lic_docs){
      bw_cart[j] = [lic_docs[i].serial,lic_docs[i].unlock_code];
      await update_db(req,lic_docs[i]._id,dbBitwig);
      console.log(`++ Bitwig sn is ${bw_cart[j][0]}`);
    }
  }else{
    console.log('Need More Bitwig Serial Numbers');
    bw_cart[1] = 'contact support@sensel.com for your Arturia license';
  }
  cart.arturia_all = art_cart;
  cart.bitwig_8ts = bw_cart;
  return cart;
}

async function update_db (req,rec_id,db_select){
  //abbreviate!
  const email = req.body.contact_email;
  const o_id = req.body.name; //weird they call it name, it's an order number.
  const first_name = req.body.customer.first_name;
  const last_name = req.body.customer.last_name;
  const name = first_name+' '+last_name;

  //update database
  await db_select.updateOne({ _id: rec_id }, { $set: { order_id: o_id, customer_email: email, customer_name: name } });
  console.log('order_id added');
  console.log('customer_email added');
  console.log('customer_name added');
}

async function sendTemplate(cart){
  // cart.arturia_all;
  // cart.bitwig_8ts;
  let art_sn, art_uc, bw_sn, tempFile;
  // create strings of the auth codes from the cart
  for(let i in cart.arturia_all){
    art_sn += cart.arturia_all[i][0]+' \n';
    art_uc += cart.arturia_all[i][1]+' \n';
  }
  for(let i in cart.bitwig_8ts){
    bw_sn += cart.bitwig_8ts[i][0]+' \n';
  }
  //figure out what email template to use
  if(cart.bitwig_8ts.length>0){
    tempFile = 'art-all_bw-s8t.ejs';
  }else{
    tempFile = 'art-all.ejs';
  }
  const template = __dirname+'/emails/swcodes/'+tempFile; //art-all.ejs or art-all_bw-s8t.ejs
  const templateData = { bitwig_sn: bw_sn, arturia_sn: art_sn,arturia_uc: art_uc};
  console.log('Begin....');
  ejs.renderFile(template, templateData , function (err, data) {
    console.log('******')
    if (err) {
        console.log(err);
    } else {
        gmailOptions.html = data;
        console.log("======================>");
        gmail_transporter.sendMail(gmailOptions, function (err, info) {
            if (err) {
                console.log(err);
            } else {
                console.log('Message sent: ' + info.response);
            }
        });
    }
  });
}

async function sendemail() {
  return 'email sent';
}

async function check_counts(){
  let count = await dbBitwig.countDocuments({ order_id: '' });
  console.log('remaining bitwig:'+count);
  if(count<10){
    gmailOptions.subject='Bitwig Serial count is < 10';
    gmailOptions.text='Bitwig Serial count is < 10';
    await sendemail();
  }

  count = await dbArturia.countDocuments({ order_id: '' });
  console.log('remaining arturia:'+count);
  if(count<10){
    gmailOptions.subject='Arturia Serial count is < 10';
    gmailOptions.text='Arturia Serial count is < 10';
    await sendemail();
  }
}

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
    from: '"Sensel Shop" <peter@sensel.com>', // sender address
    to: 'p@nbor.us', // list of receivers
    subject: 'Sensel - Your Free Software', // Subject line
    text: 'Hello world', // plain text body
};

async function process_post(req, res) {
  console.log('We got an order!...');

  console.log(`--items in order: ${req.body.line_items}`)
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
    console.log('Phew, it came from Shopify!');

    await dbDo(async (db) => {
      dbBitwig = db.collection('bitwig-licenses');
      dbArturia = db.collection('arturia-licenses');

      //Order came from Shopify, so we'll parse the info and email the customer relevant software licenses.
      await parseOrderInfo(req,res);
    });

    res.sendStatus(200);
  } else {
    // No match! This request didn't originate from Shopify
    console.log('Danger! Not from Shopify!');
    res.sendStatus(403);
  }

}

async function main() {
  await dbDo(async (db) => {
    dbBitwig = db.collection('bitwig-licenses');
    dbArturia = db.collection('arturia-licenses');

    //check the serial counts on start:
    await check_counts();
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
      res.send('SENSEL').status(200);
    })
    .post('/', async function(req, res) {
      process_post(req,res);
    })
    .post('/shopify/webhook', async function(req, res) {
      process_post(req,res);
    })

    .listen(SERVER_PORT, () => console.log(`We're listening on ${ SERVER_PORT }`));
}
main();
