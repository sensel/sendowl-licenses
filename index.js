const express = require('express')
const path = require('path')
const PORT = process.env.PORT || 5000

express()
  .use(express.static(path.join(__dirname, 'public')))
  // .set('views', path.join(__dirname, 'views'))
  // .set('view engine', 'ejs')
  // .get('/', (req, res) => res.render('pages/index'))
  .get('/', function(req, res){
    //https://polar-sands-88575.herokuapp.com/?buyer_email={{ order.buyer_email }}&buyer_name={{ order.buyer_name }}&order_id={{ order.id }}&product_id={{ product.id }}&product_name={{ product.name }}
    var order_id = req.query.order_id;
    var product_id = req.query.product_id;
    var product_name = req.query.product_name;
    var buyer_name = req.query.buyer_name;
    var buyer_email = req.query.buyer_email;
    var signature = req.query.signature;
    console.log('buyer_email: '+buyer_email);
    console.log('product_name: '+product_name);
    console.log('signature: '+signature);
  })
  .listen(PORT, () => console.log(`Listening on ${ PORT }`))
