require('dotenv').config();
const fs = require('fs');
const path = require('path');
const MongoClient = require('mongodb').MongoClient;

const source_art='arturia_test.txt'
const source_bwig='bitwig_test.txt'

// Connection URL
const url = process.env['DEV_MONGO_URI'];
// Database Name
const dbName = 'sensel-software-licenses';
let db;

(async function() {
  let client;

  try {
    // Use connect method to connect to the Server
    client = await MongoClient.connect(url, {useNewUrlParser: true});
    db = client.db(dbName);
  } catch (err) {
    console.log(err.stack);
  }

  if (client) {
    console.log('client opened')

    await testInsertArturia(db);
    await testRead(db, 'arturia-licenses');
    await testInsertBitwig(db);
    await testRead(db, 'bitwig-licenses');

    client.close();
  }
  else {
    console.log('failed to open client')
  }
})();

//create test db for arturia codes
async function testInsertArturia(db) {
  const testPath = path.resolve(__dirname, source_art);
  const lines = fs.readFileSync(testPath, 'UTF-8').toString().split('\n');
  const coll = db.collection('arturia-licenses');

  let counter = 0;
  for (let line of lines) {
    var snum = line.split(',')[0];
    var unlock = line.split(',')[1];
    await coll.insertOne({"serial":snum,"unlock_code":unlock,"customer_name":"","customer_email":"","order_id":"","product_id":"","variant_id":""});
    counter++;
  }

  console.log('Arturia completed with '+counter+' records');
}

async function testInsertBitwig(db) {
  // await bitwig.insert({"serial":snum,"customer_name":"","customer_email":"","order_id":"","product_id":"","variant_id":""});
}

async function testRead(db, collName) {
  const licenses = db.collection(collName)
  let recs = await licenses.find().toArray();
  console.log(`num read ${collName}: ${recs.length}`);
}
