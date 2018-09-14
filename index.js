
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

// db.bitwig.count({}, function (err, count) {
//   console.log('Bitwig db count '+count);
// });
// db.arturia.count({}, function (err, count) {
//   console.log('Artuira db count '+count);
// });

var parseit = function (req,res){

  var rawBody=getRawBody(req);
  const hmac = request.get('X-Shopify-Hmac-Sha256');
  const generated_hash = crypto
          .createHmac('sha256', SHOPSECRET)
          .update(rawBody)
          .digest('base64');
  console.log('from shopify? '+(generated_hash==hmac));
  console.log('****************');
  for (i in req){
    console.log('req part '+i);
  }
  for (i in req.body){
    console.log('webhook '+i+' : '+req.body[i]);
  }
  for (i in req.headers){
    console.log('HEADER '+i+' : '+req.headers[i]);
  }
}

//parse values from URL and check if signature is valid from SendOwl.
//if so process the order.
var calc_sig = function (req,res){
  //https://polar-sands-88575.herokuapp.com/?buyer_email={{ order.buyer_email }}&buyer_name={{ order.buyer_name }}&order_id={{ order.id }}&product_id={{ product.id }}&variant={{ product.shopify_variant_id }}&overlay=xxx
  //overlay: none, innovators, videoediting, musicproduction, piano, drumpad, gaming, qwerty, azerty, dvorak, thunder

  console.log('----Calculating Signature---');
  var buyer_email = req.query.buyer_email;
  var buyer_name = req.query.buyer_name;
  var order_id = req.query.order_id;
  var overlay = req.query.overlay
  var product_id = req.query.product_id;
  var variant_id = req.query.variant;
  //var product_name = req.query.product_name;
  var signature = req.query.signature;
  var params_ordered = 'buyer_email='+buyer_email+'&buyer_name='+buyer_name+'&order_id='+order_id+'&overlay='+overlay+'&product_id='+product_id+'&variant='+variant_id; //+'&product_name='+product_name;
  var crypto_text = params_ordered+'&secret='+SOSECRET;
  var crypto_key = SOKEY+'&'+SOSECRET;
  var crypto_hash = crypto.createHmac('sha1', crypto_key).update(crypto_text).digest('base64');
  console.log('calculated signature: '+crypto_hash)
  for(i in req.query){
    console.log(i+': '+req.query[i]+'\r');
  }
  //eligible for a Bitwig Studio 8 Track license?
  var gets_bw = (overlay=='innovators' || overlay=='musicproduction' || overlay=='piano' || overlay=='drumpad' || overlay=='thunder'|| overlay=='switzerland')
  //coming from SendOwl? true or false!
  if(crypto_hash==signature){
    proc_order(req,gets_bw,res);
  }else{
    order_invalid(res);
  }
  check_counts();
}

//lots of nested functions due relying on callbacks. I'm sure there's a nice way to do this, but this works.
function proc_order(req,gets_bw,res){
  console.log("processing order");
  db.arturia.count({ order_id: '' })
  // find the first record where there is no order ID and update it with the new info
  db.arturia.findOne({ order_id: '' }, function (err, onedoc) {
    if(onedoc!=null){
      var license = [];
      license = find_and_update(req,err,onedoc,db.arturia);
      //satisfy order
      console.log('++ Arturia sn and unlock are '+license[0]+' | '+license[1]);
      //var response_msg = 'ARTURIA LICENSE ...';
      //var response_msg = 'You can access your FREE copy of Analog Lab Lite from the <a href="https://www.arturia.com/support/included-analog-lab-lite-quickstart">Arturia website.</a><br>Follow the instructions and use your serial and unlock codes:<br>Arturia Analog Lab Lite Serial Number: '+license[0]+' | Unlock Code: '+license[1]+'<br>';
      var response_msg = '<br>Arturia Analog Lab Lite Serial Number: '+license[0]+' | Unlock Code: '+license[1]+'<br>';
      //bitwig for those who are eligible
      if(gets_bw){
        console.log('>>>gets bitwig')
        db.bitwig.findOne({ order_id: '' }, function (err, onedoc) {
          if(onedoc!=null){
            license = find_and_update(req,err,onedoc,db.bitwig);
            //satisfy order
            console.log('++ Bitwig sn is '+license[0]);
            //response_msg = response_msg+'AND BITWIG TOO';
            response_msg = response_msg+'Bitwig Studio 8 Track serial number: '+license[0];
            res.send(response_msg);
            console.log('** BITWIG AND ARTUIRA SENT');
          }else{
            console.log('Need More Bitwig Serial Numbers');
            //better to have no response and let SendOwl send us a warning.
            //res.send('Please contact support@sensel.com for your license.');
          }
        });
      }else{
        res.send(response_msg);
        console.log('** ONLY ARTUIRA SENT')
      }
    }else{
      console.log('Need More Arturia Serial Numbers and Unlock Codes');
      //better to have no response and let SendOwl send us a warning.
      //res.send('Please contact support@sensel.com for your license.');
    }
  });
}

function find_and_update (req,err,onedoc,db_select){
  console.log(onedoc);
  console.log(".................");
  var temp=onedoc._id;
  var lic = [onedoc.serial,onedoc.unlock_code];
  //abbreviate!
  var email = req.query.buyer_email;
  var name = req.query.buyer_name;
  var o_id = req.query.order_id;
  var p_id = req.query.product_id;

  var dbs = db_select;
  //update database
  dbs.update({ _id: temp }, { $set: { order_id: o_id } }, { multi: false }, function (err, numReplaced) {
    console.log('order_id added');
  });
  dbs.update({ _id: temp }, { $set: { product_id: p_id } }, { multi: false }, function (err, numReplaced) {
    console.log('product_id added');
  });
  dbs.update({ _id: temp }, { $set: { customer_email: email } }, { multi: false }, function (err, numReplaced) {
    console.log('customer_email added');
  });
  dbs.update({ _id: temp }, { $set: { customer_name: name } }, { multi: false }, function (err, numReplaced) {
    console.log('customer_name added');
  });

  return lic;
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

function order_invalid(res){
  console.log("ORDER INVALID")
  res.send('This order was determined to be invalid.');
}

///SETUP Email service
var transporter = nodemailer.createTransport({
    host: 'sub5.mail.dreamhost.com',
    port: 465,
    secure: true,
    auth: {
        user: EMAIL,
        pass: EPASS
    }
});
// setup email data with unicode symbols
var mailOptions = {
    from: '"Node App" <node@nbor.us>', // sender address
    to: 'p@nbor.us', // list of receivers
    subject: 'From Node App', // Subject line
    text: 'Hello world', // plain text body
};

// send mail with defined transport object
function sendemail(){
    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            return console.log(error);
        }
        console.log('Message sent: %s', info.messageId);
    });
}
//check the serial counts on start:
check_counts();
// create a server that listens for URLs with order info.
express()
  .use(express.static(path.join(__dirname, 'public')))
  .use(bodyParser.json())
  .use(bodyParser.urlencoded({ extended: true }))

  // .set('views', path.join(__dirname, 'views'))
  // .set('view engine', 'ejs')
  .get('/', calc_sig)
  .post('/shopify/webhook',parseit)
  .listen(PORT, () => console.log(`We're listening on ${ PORT }`));
