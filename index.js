
var locallydb = require('locallydb');
var crypto = require('crypto');
const express = require('express')
const path = require('path')
const PORT = process.env.PORT || 5000
//set in heroku https://devcenter.heroku.com/articles/config-vars using https://www.sendowl.com/settings/api_credentials
var SOKEY = process.env.SO_KEY;
var SOSECRET = process.env.SO_SECRET;
const ISLOCAL = process.env.LOCAL;

//for testing http://localhost:5000/?order_id=12345&buyer_name=Test+Man&buyer_email=test%40test.com&product_id=123&signature=QpIEZjEmEMZV%2FHYtinoOj5bqAFw%3D
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

// load the database (folder) in './db', will be created if doesn't exist
var db = new locallydb('./db');
var collection = db.collection('arturia');


var calc_sig = function (req,res){
  //https://polar-sands-88575.herokuapp.com/?buyer_email={{ order.buyer_email }}&buyer_name={{ order.buyer_name }}&order_id={{ order.id }}&product_id={{ product.id }}
  console.log('----Calculating Signature---');
  var buyer_email = req.query.buyer_email;
  var buyer_name = req.query.buyer_name;
  var order_id = req.query.order_id;
  var product_id = req.query.product_id;
  //var product_name = req.query.product_name;
  var signature = req.query.signature;
  var params_ordered = 'buyer_email='+buyer_email+'&buyer_name='+buyer_name+'&order_id='+order_id+'&product_id='+product_id; //+'&product_name='+product_name;
  var crypto_text = params_ordered+'&secret='+SOSECRET;
  var crypto_key = SOKEY+'&'+SOSECRET;
  var crypto_hash = crypto.createHmac('sha1', crypto_key).update(crypto_text).digest('base64');
  for(i in req.query){
    console.log(i+': '+req.query[i]+'\r');
  }
  if(crypto_hash==signature){
    proc_order();
  }else{
    order_invalid();
  }
}

function proc_order(){
  console.log("processing order");


}

function order_invalid(){
  console.log("ORDER INVALID")
}

express()
  .use(express.static(path.join(__dirname, 'public')))
  // .set('views', path.join(__dirname, 'views'))
  // .set('view engine', 'ejs')
  // .get('/', (req, res) => res.render('pages/index'))
  .get('/', calc_sig)
  .listen(PORT, () => console.log(`We're listening on ${ PORT }`));
