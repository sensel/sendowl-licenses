'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const MongoClient = require('mongodb').MongoClient;

// Connection URL
const url = process.env['MONGO_URI'];
// Database Name
const dbName = process.env.MONGO_DBNAME
// const dbName = 'heroku_z503k0d1';


let product = 'bitwig';
const collName = product+'-licenses';

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


async function ifOrderExists(coll,orderID) {
  let result = false;
  let id_check = await coll.find({ order_id: orderID });
  for (let doc = await id_check.next(); doc != null; doc = await id_check.next()) {
      console.log(`ID: ${doc._id}`);
      if(doc._id){
        result = true;
      }
    }
  console.log('result: '+result)
  return result;
}
//
// async function ifOrderExists(db, collName) {
//   const coll = db.collection(collName)
//   let result = false;
//   let recs = await coll.find().toArray();
//   console.log(`Total ${collName}: ${recs.length}`);
//   let cur_order_id = '#2611';
//   let id_check = await coll.find({ order_id: cur_order_id });
//   for (let doc = await id_check.next(); doc != null; doc = await id_check.next()) {
//       console.log(`ID: ${doc._id}`);
//       if(doc._id){
//         result = true;
//       }
//     }
//   console.log('result: '+result)
// }


dbDo(async (db) => {

  let dbBitwig = db.collection('bitwig-licenses');
  let dbArturia = db.collection('arturia-licenses');
  let onum = '#2611'
  let orderExists_bw = await ifOrderExists(dbBitwig,onum);
  let orderExists_art = await ifOrderExists(dbArturia,onum);
  console.log(`bitwig orders for ${onum} is ${orderExists_bw}`)
  console.log(`arturia orders for ${onum} is ${orderExists_art}`)
});
