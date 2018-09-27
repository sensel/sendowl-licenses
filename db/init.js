'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const MongoClient = require('mongodb').MongoClient;

// Connection URL
const url = process.env['DEV_MONGO_URI'];
// Database Name
const dbName = 'sensel-software-licenses';

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

async function testRead(db, collName) {
  const coll = db.collection(collName)
  let recs = await coll.find().toArray();
  console.log(`Created ${collName}: ${recs.length}`);
}

//create test db for arturia codes
async function testInsertArturia(db) {
  const source_art='../test/arturia_test.txt'
  const testPath = path.resolve(__dirname, source_art);
  const lines = fs.readFileSync(testPath, 'UTF-8').toString().split('\n');
  const collName = 'arturia-licenses';
  const coll = db.collection(collName);

  let counter = 0;
  for (let line of lines) {
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

  console.log('Arturia completed with '+counter+' records');

  await testRead(db, collName);
}

async function testInsertBitwig(db) {
  const source_bwig='../test/bitwig_test.txt'
  const testPath = path.resolve(__dirname, source_bwig);
  const lines = fs.readFileSync(testPath, 'UTF-8').toString().split('\n');
  const collName = 'bitwig-licenses';
  const coll = db.collection(collName);

  let counter = 0;
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

  console.log('Bitwig completed with '+counter+' records');

  await testRead(db, collName);
}

dbDo(async (db) => {
  await testInsertArturia(db);
  await testInsertBitwig(db);
});