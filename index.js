const express = require('express')
const path = require('path')
const PORT = process.env.PORT || 5000

express()
  .use(express.static(path.join(__dirname, 'public')))
  // .set('views', path.join(__dirname, 'views'))
  // .set('view engine', 'ejs')
  // .get('/', (req, res) => res.render('pages/index'))
  .get('/', function(req, res){
    //order_id buyer_name buyer_email product_id signature
    var order_id = req.query.order_id;
    var product_id = req.query.product_id;
    var buyer_name = req.query.buyer_name;
    var buyer_email = req.query.buyer_email;
    var signature = req.query.signature;
    console.log('buyer_email: '+buyer_email);
  })
  .listen(PORT, () => console.log(`Listening on ${ PORT }`))
