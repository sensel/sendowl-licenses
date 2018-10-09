'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const MongoClient = require('mongodb').MongoClient;
const license_sources = {
  'arturia':'licences-70-6-1-8-10001-1000_Sensel complete.txt',
  'bitwig':'Bitwig Studio 8-Track Licenses for Sensel - generated-serials.txt',
  'arturia_test':'arturia_test.txt',
  'bitwig_test':'bitwig_test.txt'
};
let product = 'bitwig';
let source = '../license sources/'+license_sources[product];
let test = false;

//add argument, for example, 'node add_to_db.js arturia'
//add a 2nd arg to enable testing, for example, 'node add_to_db.js bitwig 1'
if(process.argv[3]){
  test = process.argv[3];
}
if(process.argv[2]){
  console.log(`source: ${process.argv[2]}`);
  product = process.argv[2];
  source = '../license sources/'+license_sources[product];
  if(test){
    source = '../license sources/'+license_sources[product+'_test'];
  }
}

// Connection URL
const url = process.env['MONGO_URI'];
// Database Name
const dbName = 'heroku_z503k0d1';

// run given doFunc inside a database transaction
async function dbDo(doFunc) {
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
    try {
      await doFunc(db);
    } catch (err) {
      console.log(err.stack);
    }

    client.close();
  }
  else {
    console.log('failed to open client')
  }
}

async function readCodeFile(source) {
  return new Promise((resolve, reject) => {
    fs.readFile(source, 'utf8', (err, data) => {
      if (err){
        console.log('<-- file read error')
        console.log(err);
        reject(err);
        console.log('file read error --->')
      }
      else resolve(data);
    });
  });
}

async function testRead(db, collName) {
  const coll = db.collection(collName)
  let recs = await coll.find().toArray();
  console.log(`Total ${collName}: ${recs.length}`);
}

async function addToBase(db,product) {
  const sourcePath = path.resolve(__dirname, source);
  const sourceFile = await readCodeFile(sourcePath);
  const lines = sourceFile.toString().split('\n');
  const collName = product+'-licenses';
  const coll = db.collection(collName);
  let counter = 0;
  console.log(`adding to ${product} from ${sourcePath}`)
  if(product==='bitwig'){
    for (let line of lines) {
      const snum = line.split(',')[0];
      await coll.insertOne({
        "serial":snum,
        "customer_name":"",
        "customer_email":"",
        "order_id":"",
        "product_id":"",
        "variant_id":""
      });
      counter++;
    }
  }
  //arturia has an unlock code AND a serial number for its auth.
  if(product==='arturia'){
    for (let line of lines) {
      console.log(`lines ${lines[0]}`)
      const snum = line.split(',')[0];
      const unlock = line.split(',')[1];
      await coll.insertOne({
        "serial":snum,
        "unlock_code":unlock,
        "customer_name":"",
        "customer_email":"",
        "order_id":"",
        "product_id":"",
        "variant_id":""
      });
      counter++;
    }
  }
  console.log(product+' completed with '+counter+' records');

  await testRead(db, collName);
}

dbDo(async (db) => {
  await addToBase(db,product);
});
