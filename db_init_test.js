// https://github.com/louischatriot/nedb
// Type 3: Persistent datastore with automatic loading
const dbname='db/dbtest'
const source='arturia_test.txt'

var Datastore = require('nedb')
  , db = new Datastore({ filename: dbname, autoload: true });
var counter = 0;

require('fs').readFileSync(source).toString().split('\n').forEach(function (line) {
  var snum = line.split(',')[0];
  var unlock = line.split(',')[1];
  console.log('snum: '+snum+' -- unlock: '+unlock);
  db.insert({"serial":snum,"unlock_code":unlock,"customer_name":"","customer_email":"","order_id":"","product_id":""});
  counter++;
})
console.log('completed with '+counter+' records');
