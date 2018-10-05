//many thanks to Andrew Hay Kurtz https://github.com/ahk

//TO DO:
// - integrate user's email as the "to" field
// - add real serial numbers to database
// - make email template adjustments
// - document how this Works
// - document how to add serials when needed.
// - get mLab on a non-free account
// - turn off sendOwl


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
const ISLIVE = process.env.ISLIVE;
const SHOPSECRET = process.env.SHOPIFY_SHARED_SECRET;
//only set this with local .env, not with heroku config
const ISLOCAL = process.env.LOCAL;
//email to use, depending on LIVE status
const GMAIL = process.env.GMAIL_USER;
const GPASS = process.env.GMAIL_PASS;
const SUSER = process.env.SUPPORT_USER;
const SPASS = process.env.SUPPORT_PASS;
let EMAILUSER = GMAIL;
let EMAILPASS = GMAIL;
if(ISLIVE){
  EMAILUSER = SUSER;
  EMAILPASS = SPASS;
}

const TESTMAIL = process.env.TESTMAIL; //when testing, don't send to customer, send to me
const ADMINMAIL = process.env.ADMINMAIL;
const WARNING_COUNT = 30;

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

//get the order info from Shopify and grab all the interesting bits
//to figure out what, if any, serial numbers are needed.
async function parseOrderInfo (req,res){
  let email = req.body.contact_email;
  //if app isn't live, send to me, not customer.
  if(!ISLIVE){
    email = TESTMAIL;
  }
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
    const quantity = req.body.line_items[i]['quantity'];

    console.log('++   Cart Item '+i+': '+title+' w/ '+variant+' qty: '+quantity);
    console.log(`current auth needs- art: ${auths_needed.arturia_all} , bw: ${auths_needed.bitwig_8ts}`)

    //using real products
    if(ISLIVE){
      if(title == 'The Sensel Morph with 1 Overlay'){
        if(variant=='Music Production' || variant=='Piano' || variant=='Drum Pad' || variant=="Innovator's"){
          //provide Arturia and Bitwig code
          auths_needed.bitwig_8ts = auths_needed.bitwig_8ts + quantity;
          auths_needed.arturia_all = auths_needed.arturia_all + quantity;
        }else{
          //provide only Arturia
          auths_needed.arturia_all = auths_needed.arturia_all + quantity;
        }
      }
      if(title == "Morph Music Maker's Bundle"){
        //provide Arturia and Bitwig Codes
        auths_needed.bitwig_8ts = auths_needed.bitwig_8ts + quantity;
        auths_needed.arturia_all = auths_needed.arturia_all + quantity;
      }
    }

    //using test products:
    if(!ISLIVE){
      if(title == 'SenselTest'){
        console.log('SENSEL TEST PRODUCT');
        if(variant=="Innovator's"){
          console.log('INNOVATOR OVERLAY VARIANT');
          auths_needed.arturia_all = auths_needed.arturia_all + quantity;
        }
        if(variant=="Piano"){
          console.log('PIANO VARIANT');
          auths_needed.bitwig_8ts = auths_needed.bitwig_8ts + quantity;
          auths_needed.arturia_all = auths_needed.arturia_all + quantity;
        }
      }
    }
  }//end order scan
  console.log(`-----done scanning order. need ${auths_needed.arturia_all} Arturia licenses and ${auths_needed.bitwig_8ts} Bitwig licenses----`);

  //now go through db and get the auth keys as needed
  if(auths_needed.arturia_all>0 || auths_needed.bitwig_8ts>0){
    let auth_cart = await soft_auths(req,auths_needed);
    // then email the "cart" of authorizations to customer
    await sendTemplate(auth_cart,email);
  }else{
    console.log('no Serials needed for this order');
  }
}

//soft_auths looks for empty order_id fields to find available serial numbers
//returns an object with arrays of serials/authorizations for different titles
//if there are no serials left in the database, instead of arrays, we get -1 returned
async function soft_auths(req,auth){
  console.log(`>> getting authorizations for Arturia: ${auth.arturia_all} and Bitwig: ${auth.bitwig_8ts} <<`);
  // auth.bitwig_8ts is number of bitwig licenses we need to deliver
  // auth.arturia_all is number of arturia licenses we need to deliver
  let cart = {'arturia_all':[],'bitwig_8ts':[]};
  // find the first record where there is no order ID ('lic_docs'), get the license info,
  // then update entry with the new info
  //returns an array of license info. Entry 0 is Arturia, entry 1 is Bitwig.

  //find Arturia auths
  let art_cart = [];
  let ids = [];
  let index = 0
  let lic_docs = await dbArturia.find({ order_id: '' }).limit(auth.arturia_all);
  for (let doc = await lic_docs.next(); doc != null; doc = await lic_docs.next()) {
      art_cart[index] = [doc.serial,doc.unlock_code];
      ids[index] = doc._id;
      index++;
      console.log(`ART SERIALS: ${doc.serial}`);
    }
  console.log(`check lengths- cart: ${art_cart.length} vs needed ${auth.arturia_all}`)
  if(art_cart.length===auth.arturia_all){
    for(let i in art_cart){
      await update_db(req,ids[i],dbArturia);
      console.log(`++ Arturia sn and unlock are ${art_cart[i]} id ${ids[i]} - ${i}`);
    }
  }else{
    console.log('Need More Arturia Serial Numbers and Unlock Codes');
    art_cart = -1;
  }

  //find the bitwig auths
  let bw_cart = [];
  ids = [];
  index = 0;
  if(auth.bitwig_8ts>0){
    lic_docs = await dbBitwig.find({ order_id: '' }).limit(auth.bitwig_8ts);
    for (let doc = await lic_docs.next(); doc != null; doc = await lic_docs.next()) {
        bw_cart[index] = doc.serial;
        ids[index] = doc._id;
        index++;
        console.log(`BW SERIALS: ${doc.serial}`);
      }
    console.log(`check lengths- cart: ${bw_cart.length} vs needed ${auth.bitwig_8ts}`)
    if(bw_cart.length===auth.bitwig_8ts){
      let j = 0;
      for(let i in bw_cart){
        await update_db(req,ids[i],dbBitwig);
        console.log(`++ Bitwig sn is ${bw_cart[i]}`);
      }
    }else{
      console.log('Need More Bitwig Serial Numbers');
      bw_cart = -1;
    }
  }else{
    console.log('No Bitwig auths needed')
  }

  cart.arturia_all = art_cart;
  cart.bitwig_8ts = bw_cart;
  console.log(`>> lengths: ${cart.arturia_all.length} , ${cart.bitwig_8ts.length}`);
  return cart;
}

//when we grab a serial number from the database
//we update the database with customer info and order_id
//which essentially marks it as used.
async function update_db (req,rec_id,db_select){
  //abbreviate!
  const email = req.body.contact_email;
  const o_id = req.body.name; //weird they call it name, it's an order number.
  const first_name = req.body.customer.first_name;
  const last_name = req.body.customer.last_name;
  const name = first_name+' '+last_name;

  //update database
  await db_select.updateOne({ _id: rec_id }, { $set: { order_id: o_id, customer_email: email, customer_name: name } });
  console.log('order_id, customer_email, and customer_name added');
}

async function sendTemplate(cart,emailto){
  let art_sn = '<br>';
  let art_uc = '<br>';
  let bw_sn =  '<br>';
  let tempFile = '';

  if(cart.arturia_all != -1){
    // create strings of the auth codes from the cart
    for(let i in cart.arturia_all){
      art_sn += cart.arturia_all[i][0]+' <br>';
      art_uc += cart.arturia_all[i][1]+' <br>';
    }
  }else{
    art_sn = 'please contact <a href="mailto:support@sensel.com">support@sensel.com</a> for your Arturia serial numbers'
  }

  if(cart.bw_8ts != -1){
    for(let i in cart.bitwig_8ts){
      bw_sn += cart.bitwig_8ts[i]+' <br>';
    }
  }else{
    bw_sn = 'please contact <a href="mailto:support@sensel.com">support@sensel.com</a> for your Bitwig serial numbers'
  }

  console.log(`arturia : ${art_sn} , ${art_uc} - bitwig : ${bw_sn}`)
  //figure out what email template to use
  if(cart.bitwig_8ts.length>0){
    tempFile = 'art-all_bw-s8t.ejs';
    console.log('using email template for arturia and bitwig ');
  }else{
    tempFile = 'art-all.ejs';
    console.log('using email template for arturia ');
  }
  const template = __dirname+'/emails/swcodes/'+tempFile; //art-all.ejs or art-all_bw-s8t.ejs
  const templateData = { bitwig_sn: bw_sn, arturia_sn: art_sn, arturia_uc: art_uc};
  console.log('Begin....');
  ejs.renderFile(template, templateData , function (err, data) {
    console.log('******')
    if (err) {
        console.log(err);
    } else {
        gmailOptions.to=emailto;
        gmailOptions.subject='Sensel - Your Free Software';
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
  gmailOptions.to=ADMINMAIL;
  gmailOptions.html = '';
  gmail_transporter.sendMail(gmailOptions, function (err, info) {
      if (err) {
          console.log(err);
      } else {
          console.log('Message sent: ' + info.response);
      }
  });
  return 'email sent';
}

async function check_counts(){
  let count = await dbBitwig.countDocuments({ order_id: '' });
  console.log('remaining bitwig:'+count);
  if(count<WARNING_COUNT){
    gmailOptions.subject = `Bitwig Serial count is < ${WARNING_COUNT}`;
    gmailOptions.text = `Bitwig Serial count is < ${WARNING_COUNT}`;
    await sendemail();
  }

  count = await dbArturia.countDocuments({ order_id: '' });
  console.log('remaining arturia:'+count);
  if(count<WARNING_COUNT){
    gmailOptions.subject = `Arturia Serial count is < ${WARNING_COUNT}`;
    gmailOptions.text = `Arturia Serial count is < ${WARNING_COUNT}`;
    await sendemail();
  }
}

///SETUP Email service
///with google
const gmail_transporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
        user: EMAILUSER,
        pass: EMAILPASS
    }
});

// setup email data
const gmailOptions = {
    from: '"Sensel Shop" <peter@sensel.com>', // sender address
    to: 'someone@somewhere.com', // list of receivers
    subject: 'Sensel - Your Free Software', // Subject line
    text: 'Serial number authorizations', // plain text body
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
    console.log('Authorized Order, it came from Shopify!');
    await dbDo(async (db) => {
      dbBitwig = db.collection('bitwig-licenses');
      dbArturia = db.collection('arturia-licenses');

      await check_counts();
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
