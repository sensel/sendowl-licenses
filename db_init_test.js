// https://github.com/louischatriot/nedb
// Type 3: Persistent datastore with automatic loading
const db_art='db/art_test'
const source_art='arturia_test.txt'
const db_bwig='db/bwig_test'
const source_bwig='bitwig_test.txt'

var Datastore = require('nedb');

//create test db for arturia codes
var dbfile = db_art;
var source = source_art;
var db_ar = new Datastore({ filename: dbfile, autoload: true });
var counter = 0;

require('fs').readFileSync(source).toString().split('\n').forEach(function (line) {
  var snum = line.split(',')[0];
  var unlock = line.split(',')[1];
  console.log('snum: '+snum+' -- unlock: '+unlock);
  db_ar.insert({"serial":snum,"unlock_code":unlock,"customer_name":"","customer_email":"","order_id":"","product_id":"","variant_id":""});
  counter++;
})

console.log('Arturia completed with '+counter+' records');

///create test db for Bitwig
dbfile = db_bwig;
source = source_bwig;

var db_bw = new Datastore({ filename: dbfile, autoload: true });
var counter = 0;

require('fs').readFileSync(source).toString().split('\n').forEach(function (line) {
  var snum = line.split(',')[0];
  var unlock = line.split(',')[1];
  console.log('snum: '+snum);
  db_bw.insert({"serial":snum,"customer_name":"","customer_email":"","order_id":"","product_id":"","variant_id":""});
  counter++;
})

console.log('Bitwig completed with '+counter+' records');
