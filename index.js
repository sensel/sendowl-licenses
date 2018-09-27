'use strict';

require('dotenv').config();
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const express = require('express');
//handle POST from shopify webhook
const bodyParser = require('body-parser');
const path = require('path');
const MongoClient = require('mongodb').MongoClient;

const PORT = process.env.PORT || 5000;
//set in heroku https://devcenter.heroku.com/articles/config-vars using https://www.sendowl.com/settings/api_credentials
let SOKEY = process.env.SO_KEY;
let SOSECRET = process.env.SO_SECRET;
const SHOPSECRET = process.env.SHOPIFY_SHARED_SECRET;
//only set locally
const ISLOCAL = process.env.LOCAL;
const GMAIL = process.env.GMAIL_USER;
const GPASS = process.env.GMAIL_PASS;

//for testing http://localhost:5000/?order_id=12345&buyer_name=Test+Man&buyer_email=test%40test.com&product_id=123&variant=0&overlay=piano&signature=zWh3BvsRmbxHrZWj78uYGCMzd7Q%3D
if(ISLOCAL){
  SOKEY='publicStr';
  SOSECRET='t0ps3cr3t';
}

//is there a problem?
if(!SOKEY){
  console.log('SO_KEY '+SOKEY);
}
if(!SOSECRET){
  console.log('SO_SECRET '+SOSECRET);
}

const dbName = 'sensel-software-licenses'
let dbBitwig;
let dbArturia;

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

//when order is scanned, we store counts of auths to send out
let auth = {'bitwig_8ts':0, 'arturia_all':0};

//get the order info from Shopify and grab all the interesting bits.
async function parseOrderInfo (req,res){
  const email = req.body.contact_email;
  const order_num = req.body.name;
  const first_name = req.body.customer.first_name;
  const last_name = req.body.customer.last_name;
  //clear counter
  auth = {'bitwig_8ts':0, 'arturia_all':0};
  const auths = []; //fills up with software authorizations as we scann thru the order for eligible products.

  //scan thru order and count the number of auths we'll need.
  //then, after scanning pass thru a function that gets all the auths
  for (let i in req.body.line_items){
    const title = req.body.line_items[i]['title'];
    const variant = req.body.line_items[i]['variant_title'];

    console.log('++   Cart Item '+i+': '+title+' w/ '+variant);

    if(title == 'The Sensel Morph with 1 Overlay'){
      if(variant=='Music Production' || variant=='Piano' || variant=='Drum Pad' || variant=="Innovator's"){
        //provide Arturia and Bitwig code
        auth.bitwig_8ts = auth.bitwig_8ts ++;
        auth.arturia_all = auth.arturia_all ++;
      }else{
        //provide only Arturia
        auths[i] = await soft_auths(req);
        auth.arturia_all = auth.arturia_all ++;
      }
    }
    if(title == "Morph Music Maker's Bundle"){
      //provide Arturia and Bitwig Codes
      auth.bitwig_8ts = auth.bitwig_8ts ++;
      auth.arturia_all = auth.arturia_all ++;
    }
    //using test products:
    if(title == 'SenselTest'){
      console.log('SENSEL TEST PRODUCT');
      if(variant=="Innovator's"){
        console.log('INNOVATOR OVERLAY VARIANT');
        auth.arturia_all = auth.arturia_all ++;
      }
      if(variant=="Piano"){
        console.log('PIANO VARIANT');
        auth.bitwig_8ts = auth.bitwig_8ts ++;
        auth.arturia_all = auth.arturia_all ++;
      }
    }
  }
  console.log('-----done scanning order------');
}


//soft_auths is for POST requests direct from Shopify webhook
//lots of nested functions due relying on callbacks. I'm sure there's a nice way to do this, but this works.
async function soft_auths(req){
  console.log("getting auths");
  // find the first record where there is no order ID ('onedoc'), get the license info,
  // then update entry with the new info
  //returns an array of license info. Entry 0 is Arturia, entry 1 is Bitwig.
  const onedoc = await dbArturia.find({ order_id: '' }).limit(1);
  const cart = {};

  if(onedoc!=null){
    cart['arturia'] = [onedoc.serial,onedoc.unlock_code];
    await update_db(req,onedoc._id,dbArturia);
    console.log('++ Arturia sn and unlock are '+cart.arturia[0]+' | '+cart.arturia[1]);
    //bitwig for those who are eligible
    if(gets_bw){
      console.log('>>>gets bitwig')
      const onedoc = await dbBitwig.find({ order_id: '' }).limit(1);
      if(onedoc!=null){
        cart['bitwig'] = [onedoc.serial];
        await update_db(req,onedoc._id,dbBitwig);
        //satisfy order
        console.log('++ Bitwig sn is '+cart.bitwig);
        //console.log('** BITWIG AND ARTUIRA FETCHED');
      }else{
        console.log('Need More Bitwig Serial Numbers');
        cart[1] = 'contact support@sensel.com for your Bitwig license';
      }
    }else{
      console.log('** ONLY ARTUIRA ELIGIBLE')
    }
  }else{
    console.log('Need More Arturia Serial Numbers and Unlock Codes');
    cart[0] = 'contact support@sensel.com for your Arturia license';
  }

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
  await db_select.updateOne({ _id: rec_id }, { $set: { order_id: o_id } });
  console.log('order_id added');
  await db_select.updateOne({ _id: rec_id }, { $set: { customer_email: email } });
  console.log('customer_email added');
  await db_select.updateOne({ _id: rec_id }, { $set: { customer_name: name } });
  console.log('customer_name added');
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
    from: '"Sensel - Your Free Software" <peter@sensel.com>', // sender address
    to: 'p@nbor.us', // list of receivers
    subject: 'From Node App', // Subject line
    text: 'Hello world', // plain text body
};

function sendTemplate(tempFile,art_sn,art_uc,bw_sn){
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
            if (req.url.startsWith('/shopify')){
              req.rawbody = buf;
            }
        }
    })
    )
    .use(bodyParser.urlencoded({ extended: true }))

    .get('/', function(req, res) {
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
    })

    .listen(PORT, () => console.log(`We're listening on ${ PORT }`));
}
main();