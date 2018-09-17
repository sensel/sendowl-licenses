
require('dotenv').config();
var crypto = require('crypto');
const nodemailer = require('nodemailer');
const express = require('express');
//handle POST from shopify webhook
const bodyParser = require('body-parser');
var getRawBody = require('raw-body')

const path = require('path');
const PORT = process.env.PORT || 5000;
//set in heroku https://devcenter.heroku.com/articles/config-vars using https://www.sendowl.com/settings/api_credentials
var SOKEY = process.env.SO_KEY;
var SOSECRET = process.env.SO_SECRET;
const SHOPSECRET = process.env.SHOPIFY_SHARED_SECRET;
//only set locally
const ISLOCAL = process.env.LOCAL;
const EMAIL = process.env.EMAIL_USER;
const EPASS = process.env.EMAIL_PASS;
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

// https://github.com/louischatriot/nedb
// Type 3: Persistent datastore with automatic loading
const db_bitwig_name='db/bwig_test';
const db_arturia_name='db/art_test';
const db_count_name='db/count_test';
var Datastore = require('nedb');
var db = {};
db.bitwig = new Datastore({ filename: db_bitwig_name, autoload: true });
db.arturia = new Datastore({ filename: db_arturia_name, autoload: true });
db.counter = new Datastore({ filename: db_count_name, autoload: true });

function showWebhook(req){
  for (i in req){
    console.log('req part '+i);
  }
  for (i in req.body){
    console.log('webhook '+i+' : '+req.body[i]);
  }
  for (i in req.headers){
    console.log('HEADER '+i+' : '+req.headers[i]);
  }
  for (i in req.body.customer){
    console.log('customer: '+i+' - '+req.body.customer[i]);
  }
}

//get the order info from Shopify and grab all the interesting bits.
function parseOrderInfo (req,res){

      //showWebhook(req);

      var email = req.body.contact_email;
      var order_num = req.body.name;
      var first_name = req.body.customer.first_name;
      var last_name = req.body.customer.last_name;


      var auths = []; //fills up with software authorizations as we scann thru the order for eligible products.
      for (i in req.body.line_items){
        var title = req.body.line_items[i]['title'];
        var qty = req.body.line_items[i]['quantity'];
        var variant = req.body.line_items[i]['variant_title'];

        console.log('Cart Item '+i+': '+title+' w/ '+variant);

        if(title == 'The Sensel Morph with 1 Overlay'){
          if(variant=='Music Production' || variant=='Piano' || variant=='Drum Pad' || variant=="Innovator's"){
            //provide Arturia and Bitwig code
            auths[i] = new soft_auths(req,1);
          }else{
            //provide only Arturia
            auths[i] = new soft_auths(req);
          }
        }
        if(title == "Morph Music Maker's Bundle"){
          //provide Arturia and Bitwig Codes
          auths[i] = new soft_auths(req,1);
        }
        //using test products:
        if(title == 'SenselTest'){
          console.log('SENSEL TEST PRODUCT');
          if(variant=="Innovator's"){
            console.log('INNOVATOR OVERLAY VARIANT');
            auths[i] = new soft_auths(req);
          }
          if(variant=="Piano"){
            console.log('PIANO VARIANT');
            auths[i] = new soft_auths(req,1);
          }
        }

      }
      console.log('-----done scanning order------');
      //now that the order has been scanned, send an email will all software licenses
      //gmailOptions.to = email; // list of receivers
      for (i in auths){
        console.log(i+' '+auths[i]);
        for (j in auths[i]){
          console.log('AUTHORIZATIONS: '+i+' : '+j+' - '+auths[i][j]);
        }
      }

}


//soft_auths is for POST requests direct from Shopify webhook
//lots of nested functions due relying on callbacks. I'm sure there's a nice way to do this, but this works.
function soft_auths(req,gets_bw){
  console.log("getting auths");
  // find the first record where there is no order ID ('onedoc'), get the license info,
  // then update entry with the new info
  //returns an array of license info. Entry 0 is Arturia, entry 1 is Bitwig.
  db.arturia.findOne({ order_id: '' }, function (err, onedoc) {
    var cart = {};

    if(onedoc!=null){
      cart['arturia'] = [onedoc.serial,onedoc.unlock_code];
      update_db(req,onedoc._id,db.arturia);
      console.log('++ Arturia sn and unlock are '+cart.arturia[0]+' | '+cart.arturia[1]);
      //bitwig for those who are eligible
      if(gets_bw){
        console.log('>>>gets bitwig')
        db.bitwig.findOne({ order_id: '' }, function (err, onedoc) {
          if(onedoc!=null){
            cart['bitwig'] = [onedoc.serial];
            update_db(req,onedoc._id,db.bitwig);
            //satisfy order
            console.log('++ Bitwig sn is '+cart.bitwig);
            console.log('** BITWIG AND ARTUIRA FETCHED');
          }else{
            console.log('Need More Bitwig Serial Numbers');
            cart[1] = 'contact support@sensel.com for your Bitwig license';
          }
        });
      }else{
        console.log('** ONLY ARTUIRA ELIGIBLE')
      }
    }else{
      console.log('Need More Arturia Serial Numbers and Unlock Codes');
      cart[0] = 'contact support@sensel.com for your Arturia license';
    }
    return cart
  });
}

function update_db (req,rec_id,db_select){
  //abbreviate!
  var email = req.body.contact_email;
  var o_id = req.body.name; //weird they call it name, it's an order number.
  var first_name = req.body.customer.first_name;
  var last_name = req.body.customer.last_name;
  var name = first_name+' '+last_name;

  var dbs = db_select;
  //update database
  dbs.update({ _id: rec_id }, { $set: { order_id: o_id } }, { multi: false }, function (err, numReplaced) {
    console.log('order_id added');
  });
  dbs.update({ _id: rec_id }, { $set: { customer_email: email } }, { multi: false }, function (err, numReplaced) {
    console.log('customer_email added');
  });
  dbs.update({ _id: rec_id }, { $set: { customer_name: name } }, { multi: false }, function (err, numReplaced) {
    console.log('customer_name added');
  });
}

function check_counts(){
  db.bitwig.count({ order_id: '' }, function (err, count) {
    console.log('remaining bitwig:'+count);
    if(count<10){
      mailOptions.subject='Bitwig Serial count is < 10';
      mailOptions.text='Bitwig Serial count is < 10';
      sendemail();
    }
  });
  db.arturia.count({ order_id: '' }, function (err, count) {
    console.log('remaining arturia:'+count);
    if(count<10){
      mailOptions.subject='Arturia Serial count is < 10';
      mailOptions.text='Arturia Serial count is < 10';
      sendemail();
    }
  });
}

///SETUP Email service
///with google
var gmail_transporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
        user: GMAIL,
        pass: GPASS
    }
});

// setup email data
var gmailOptions = {
    from: '"Sensel - Your Free Software" <peter@sensel.com>', // sender address
    to: 'p@nbor.us', // list of receivers
    subject: 'From Node App', // Subject line
    text: 'Hello world', // plain text body
};

function sendTemplate(tempFile,art_sn,art_uc,bw_sn){
  var template = __dirname+'/emails/swcodes/'+tempFile; //art-all.ejs or art-all_bw-s8t.ejs
  var templateData = { bitwig_sn: bw_sn, arturia_sn: art_sn,arturia_uc: art_uc};
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


//check the serial counts on start:
check_counts();
// create a server that listens for URLs with order info.
express()
  .use(express.static(path.join(__dirname, 'public')))
  .use(bodyParser.json({
      type:'*/*',
      limit: '50mb',
      verify: function(req, res, buf) {
          if (req.url.startsWith('/shopify')){
            req.rawbody = buf;
          }
      }
   })
  )
  .use(bodyParser.urlencoded({ extended: true }))

  .post('/shopify/webhook', function (req, res) {
    console.log('We got an order!')
    // We'll compare the hmac to our own hash
    const hmac = req.get('X-Shopify-Hmac-Sha256');
    // Use raw-body to get the body (buffer)
    //const body = JSON.stringify(req.body);
    // Create a hash using the body and our key
    const hash = crypto
      .createHmac('sha256', SHOPSECRET)
      .update(req.rawbody, 'utf8', 'hex')
      .digest('base64')
    // Compare our hash to Shopify's hash
    if (hash === hmac) {
      // It's a match! All good
      console.log('Phew, it came from Shopify!');
//Order came from Shopify, so we'll parse the info and email the customer relevant software licenses.
      parseOrderInfo(req,res);
      res.sendStatus(200);
    } else {
      // No match! This request didn't originate from Shopify
      console.log('Danger! Not from Shopify!');
      res.sendStatus(403);
    }
  })

  .listen(PORT, () => console.log(`We're listening on ${ PORT }`));
