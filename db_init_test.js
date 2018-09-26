// https://github.com/louischatriot/nedb
// Type 3: Persistent datastore with automatic loading
const db_art='db/art_test'
const source_art='arturia_test.txt'
const db_bwig='db/bwig_test'
const source_bwig='bitwig_test.txt'

const fs = require('fs');
const MongoClient = require('mongodb').MongoClient;
(async function() {
  // Connection URL
  const url = 'mongodb://root:mongo-password@mongo:27017';
  // Database Name
  const dbName = 'sensel-software-licenses';
  let client;
  let db;

  try {
    // Use connect method to connect to the Server
    client = await MongoClient.connect(url, {useNewUrlParser: true});
    db = client.db(dbName);
  } catch (err) {
    console.log(err.stack);
  }

  if (client) {
    console.log('client opened')

    // await testInsert(db)
    await testRead(db);

    client.close();
  }
  else {
    console.log('failed to open client')
  }
})();

async function testInsert(db) {
  const licenses = db.collection('licenses')

  // var Datastore = require('nedb');

  //create test db for arturia codes
  var dbfile = db_art;
  var source = source_art;
  // var db_ar = new Datastore({ filename: dbfile, autoload: true });
  let counter = 0;

  let lines = fs.readFileSync(source).toString().split('\n');

  // await Promise.all(lines.map(async function (line) {
  //   var snum = line.split(',')[0];
  //   var unlock = line.split(',')[1];
  //   console.log('snum: '+snum+' -- unlock: '+unlock);
  //   await licenses.insertOne({"serial":snum,"unlock_code":unlock,"customer_name":"","customer_email":"","order_id":"","product_id":"","variant_id":""});
  //   counter++;
  // }));

  // let obj = {'1': 1, '2':2, '3':4};
  // for (let k in obj) { console.log(obj[k]) }

  // let arr = [1,2,3];
  // for (let i of arr) { console.log(i) }

  for (let line of lines) {
    var snum = line.split(',')[0];
    var unlock = line.split(',')[1];
    console.log('snum: '+snum+' -- unlock: '+unlock);
    await licenses.insertOne({"serial":snum,"unlock_code":unlock,"customer_name":"","customer_email":"","order_id":"","product_id":"","variant_id":""});
    counter++;
  }
  console.log('Arturia completed with '+counter+' records');

}

async function testRead(db) {
  const licenses = db.collection('licenses')
  let recs = await licenses.find().toArray();
  console.log('read records: ')
  console.log(recs)
}

///create test db for Bitwig
// dbfile = db_bwig;
// source = source_bwig;

// var db_bw = new Datastore({ filename: dbfile, autoload: true });
// var counter = 0;

// require('fs').readFileSync(source).toString().split('\n').forEach(function (line) {
//   var snum = line.split(',')[0];
//   var unlock = line.split(',')[1];
//   console.log('snum: '+snum);
//   db_bw.insert({"serial":snum,"customer_name":"","customer_email":"","order_id":"","product_id":"","variant_id":""});
//   counter++;
// })
// console.log('Bitwig completed with '+counter+' records');

// db_bw.count({ order_id: '' }, function (err, count) {
//   console.log('remaining bitwig:'+count);
// });
// db_ar.count({ order_id: '' }, function (err, count) {
//   console.log('remaining arturia:'+count);
// });
