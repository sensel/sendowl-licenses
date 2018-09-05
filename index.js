const express = require('express')
const path = require('path')
const PORT = process.env.PORT || 5000
//set in heroku https://devcenter.heroku.com/articles/config-vars using https://www.sendowl.com/settings/api_credentials
const SO_KEY = process.env.SO_KEY;
const SO_SECRET = process.env.SO_SECRET;
//for testing
var tSO_SECRET='t0ps3cr3t';
var tSO_KEY='publicStr';

if(SO_KEY==undefined){
  console.log('SO_KEY undef');
}
if(SO_KEY==undefined){
  console.log('SO_SECRET undef');
}

var crypto = require('crypto');

express()
  .use(express.static(path.join(__dirname, 'public')))
  // .set('views', path.join(__dirname, 'views'))
  // .set('view engine', 'ejs')
  // .get('/', (req, res) => res.render('pages/index'))
  .get('/', function(req, res){
    //https://polar-sands-88575.herokuapp.com/?buyer_email={{ order.buyer_email }}&buyer_name={{ order.buyer_name }}&order_id={{ order.id }}&product_id={{ product.id }}&product_name={{ product.name }}
    console.log(req.params);
    console.log('-------');
    var buyer_email = req.query.buyer_email;
    var buyer_name = req.query.buyer_name;
    var order_id = req.query.order_id;
    var product_id = req.query.product_id;
    var product_name = req.query.product_name;
    var signature = req.query.signature;
    var params_ordered = 'buyer_email='+buyer_email+'&buyer_name'+buyer_name+'&order_id'+order_id+'&product_id'+product_id+'&product_name'+product_name;
    //var params_ordered = 'buyer_email=test@test.com&buyer_name=Test Man&order_id=12345&product_id=123';
    var crypto_text = params_ordered+'&secret='+tSO_SECRET;
    var crypto_key = SO_KEY+'&'+SO_SECRET;
    var crypto_hash = crypto.createHmac('sha1', crypto_key).update(crypto_text).digest('base64');
    console.log('buyer_email: '+buyer_email);
    console.log('buyer_name: '+buyer_name);
    console.log('order_id: '+order_id);
    console.log('product_id: '+product_id);
    console.log('product_name: '+product_name);
    console.log('signature: '+signature);
    console.log('crypto_hash: '+crypto_hash);
  })
  .listen(PORT, () => console.log(`We're listening on ${ PORT }`))

//localhost:5000/?buyer_email=junk&buyer_name=junk&order_id=junk&product_id=junk&product_name=junk&signature=12345
