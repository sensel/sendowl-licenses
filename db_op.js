//may want to encrypt the database. here's how https://lollyrock.com/articles/nodejs-encryption/

// https://github.com/louischatriot/nedb
// Type 3: Persistent datastore with automatic loading
const dbname='db/dbtest'
const source='arturia_test.txt'

var Datastore = require('nedb')
  , db = new Datastore({ filename: dbname, autoload: true });

db.count({}, function (err, count) {
  console.log('db count '+count)
});
//query {order_id:''}
function printfinds(query){
  db.find(query, function (err, docs) {
    console.log("-------finds---------");
    console.log(docs);
    console.log("----------------");
  });
}

printfinds({order_id:''});


// find the first record where there is no order ID
// db.findOne({ order_id: '' }, function (err, onedoc) {
//   console.log(onedoc);
//   console.log(".................");
//   var temp=onedoc._id;
//   //add an order to this first record
//   // Set an existing field's value
//   onedoc.order_id = 333;
//   console.log(".................");
//   printfinds({order_id:''});
// });


// find the first record where there is no order ID
db.findOne({ order_id: '' }, function (err, onedoc) {
  console.log(onedoc);
  console.log(".................");
  var temp=onedoc._id;
  //add an order to this first record
  // Set an existing field's value
  db.update({ _id: temp }, { $set: { order_id: 432 } }, { multi: false }, function (err, numReplaced) {
    console.log(numReplaced);
  });
  db.update({ _id: temp }, { $set: { email: 'jo@dkj.com' } }, { multi: false }, function (err, numReplaced) {
    console.log(numReplaced);
  });
  db.update({ _id: temp }, { $set: { customer_name: 'Mo Bo' } }, { multi: false }, function (err, numReplaced) {
    console.log(numReplaced);
  });
});
