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

async function dropCollection(db, collName) {
  try {
    await db.collection(collName).drop();
  } catch (err) {
    console.log('Failed to drop collection: ', err.message)
  }

  await testRead(db, collName);
}

async function testRead(db, collName) {
  const coll = db.collection(collName)
  let recs = await coll.find().toArray();
  console.log(`Remaining ${collName}: ${recs.length}`);
}

dbDo(async (db) => {
  await dropCollection(db, 'arturia-licenses');
  await dropCollection(db, 'bitwig-licenses');
});
