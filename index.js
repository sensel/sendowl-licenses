
var crypto = require('crypto');
const express = require('express')
const path = require('path')
const PORT = process.env.PORT || 5000
//set in heroku https://devcenter.heroku.com/articles/config-vars using https://www.sendowl.com/settings/api_credentials
var SOKEY = process.env.SO_KEY;
var SOSECRET = process.env.SO_SECRET;
//only set locally
const ISLOCAL = process.env.LOCAL;

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
var Datastore = require('nedb');
var db = {};
db.bitwig = new Datastore({ filename: db_bitwig_name, autoload: true });
db.arturia = new Datastore({ filename: db_arturia_name, autoload: true });
db.bitwig.count({}, function (err, count) {
  console.log('Bitwig db count '+count);
});
db.arturia.count({}, function (err, count) {
  console.log('Artuira db count '+count);
});

//parse values from URL and check if signature is valid from SendOwl.
//if so process the order.
var calc_sig = function (req,res){
  //https://polar-sands-88575.herokuapp.com/?buyer_email={{ order.buyer_email }}&buyer_name={{ order.buyer_name }}&order_id={{ order.id }}&product_id={{ product.id }}&variant={{ shopify_variant_id }}&overlay=xxx
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
  var gets_bw = (overlay=='innovators' || overlay=='musicproduction' || overlay=='piano' || overlay=='drumpad' || overlay=='thunder')
  //coming from SendOwl? true or false!
  if(crypto_hash==signature){
    proc_order(req,gets_bw,res);
  }else{
    order_invalid(res);
  }
}

function proc_order(req,gets_bw,res){
  console.log("processing order");
  // find the first record where there is no order ID and update it with the new info
  db.arturia.findOne({ order_id: '' }, function (err, onedoc) {
    var license = [];
    license = find_and_update(req,err,onedoc,db.arturia);
    //satisfy order
    console.log('your Arturia sn and unlock are '+license[0]+' -- '+license[1]);
    var response_msg = '<p>You can access your FREE copy of Analog Lab Lite from the <a href="https://www.arturia.com/support/included-analog-lab-lite-quickstart">Arturia website.</a><br>Follow the instructions and use your serial and unlock codes:<br>Arturia Analog Lab Lite Serial Number: '+license[0]+' | Unlock Code: '+license[1]+'<p>'
    //bitwig for those who are eligible
    if(gets_bw){
      console.log('>>>gets bitwig')
      db.bitwig.findOne({ order_id: '' }, function (err, onedoc) {
        license = find_and_update(req,err,onedoc,db.bitwig);
        //satisfy order
        console.log('your Bitwig sn is '+license[0]);
        response_msg = response_msg+'<p>You can access your FREE copy of Bitwig Studio 8-Track from the <a href="https://www.bitwig.com/en/download.html">Bitwig website.</a><br><a href="https://www.bitwig.com/en/account/register.html">Create an account</a> and register this serial number: '+license[0]+'<br>You will then be able to authorize your computer for Studio 8-Track.</p>'
        res.send(response_msg);
      });
    }else{
      res.send(response_msg);
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

function order_invalid(res){
  console.log("ORDER INVALID")
  res.send('This order was determined to be invalid.');
}

// create a server that listens for URLs with order info.
express()
  .use(express.static(path.join(__dirname, 'public')))
  // .set('views', path.join(__dirname, 'views'))
  // .set('view engine', 'ejs')
  // .get('/', (req, res) => res.render('pages/index'))
  .get('/', calc_sig)
  .listen(PORT, () => console.log(`We're listening on ${ PORT }`));
