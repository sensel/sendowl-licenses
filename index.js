//many thanks to Andrew Hay Kurtz https://github.com/ahk

//TO DO:

// app was at https://polar-sands-88575.herokuapp.com/
//https://git.heroku.com/polar-sands-88575.git

//app is now at https://sensel-shopify-softauths.herokuapp.com/
// https://git.heroku.com/sensel-shopify-softauths.git

'use strict';
//for local environment variables in a '.env' file. not needed in heroku cloud
require('dotenv').config();
//for calculating signature from Shopify
const crypto = require('crypto');
//used for calculating signature to verify Shopify POST
let getRawBody = require('raw-body')
//makes sending email easy
const nodemailer = require('nodemailer');
//the server
const express = require('express');
//handle POST from shopify webhook
const bodyParser = require('body-parser');
//for making sure filepath is correct
const path = require('path');
//for reading files to test from
let fs = require('fs');
//database hooks
const MongoClient = require('mongodb').MongoClient;
//used for email templates
let ejs = require('ejs');

//environment VARS set in heroku https://devcenter.heroku.com/articles/config-vars
//or in local .env file

let SERVER_PORT = process.env.PORT || 5000;

//is the app listening to real orders from customers?
const ISLIVE = process.env.ISLIVE;
//should we use order data stored in JSON files instead of listening to shopify?
const RUNTEST = process.env.RUNTEST;
//for authorizing the POST as coming from Shopify servers:
const SHOPSECRET = process.env.SHOPIFY_SHARED_SECRET;
//only set this with local .env, not with heroku config
const ISLOCAL = process.env.LOCAL;
//email to use, depending on LIVE status

const GMAIL = process.env.GMAIL_USER; //me@sensel
const GPASS = process.env.GMAIL_PASS;
const SUSER = process.env.SUPPORT_USER; //support@
const SPASS = process.env.SUPPORT_PASS;
const NMAIL = process.env.EMAIL_USER; //alt email
const NPASS = process.env.EMAIL_PASS;
let EMAILUSER = GMAIL;
let EMAILPASS = GPASS;
//if this is live, we'll use the support@ email
if(ISLIVE==1){
  EMAILUSER = SUSER;
  EMAILPASS = SPASS;
}
// let skunames = {"S4001":"Morph Music Maker's Bundle", "S0002":"No Overlay", "S4009":"Piano", "S4008":"Music Production", "S4010":"Drum Pad", "S4002":"Innovator's	", "S4007":"Video Editing", "S4011":"Gaming", "S4003":"QWERTY Keyboard", "S4004":"AZERTY Keyboard", "S4005":"DVORAK Keyboard", "S4013":"Morph with Buchla Thunder Overlay"}
let skunames = {
 "S4001":"Morph Music Maker's Bundle",
 "S40002":"No Overlay",
 "S4009":"Piano",
 "S4008":"Music Production",
 "S4010":"Drum Pad",
 "S4002":"Innovator's	",
 "S4007":"Video Editing",
 "S4011":"Gaming",
 "S4003":"QWERTY Keyboard",
 "S4004":"AZERTY Keyboard",
 "S4005":"DVORAK Keyboard",
 "S4013":"Morph with Buchla Thunder Overlay",
 "S4014":"Creative Producer Kit",
 "S4015" : "Everything - QWERTY Gray WithDevCable",
 "S4016" : "Everything - QWERTY Gray NoDevCable",
 "S4017" : "Everything - QWERTY Blue WithDevCable",
 "S4018" : "Everything - QWERTY Blue NoDevCable",
 "S4019" : "Everything - QWERTY Pink WithDevCable",
 "S4020" : "Everything - QWERTY Pink NoDevCable",
 "S4021" : "Everything - AZERTY Gray WithDevCable",
 "S4022" : "Everything - AZERTY Gray NoDevCable",
 "S4023" : "Everything - AZERTY Blue WithDevCable",
 "S4024" : "Everything - AZERTY Blue NoDevCable",
 "S4025" : "Everything - AZERTY Pink WithDevCable",
 "S4026" : "Everything - AZERTY Pink NoDevCable",
 "S4027" : "Everything - DVORAK Gray WithDevCable",
 "S4028" : "Everything - DVORAK Gray NoDevCable",
 "S4029" : "Everything - DVORAK Blue WithDevCable",
 "S4030" : "Everything - DVORAK Blue NoDevCable",
 "S4031" : "Everything - DVORAK Pink WithDevCable",
 "S4032" : "Everything - DVORAK Pink NoDevCable",
 }
const TESTMAIL = process.env.TESTMAIL; //when testing, don't send to customer, send to me
const ADMINMAIL = process.env.ADMINMAIL; //for warnings
//how many serials should be have left before we send out warning emails to admin?
const WARNING_COUNT = 50;
const dbName = process.env.MONGO_DBNAME

//just declare these variables, we'll fill them later
let dbBitwig;
let dbArturia;
let dbAalto;
let dbMorphSNs;

// run given doFunc inside a database transaction
async function dbDo(doFunc) {
  let client;
  let db;

  try {
    // Use connect method to connect to the Server
    client = await MongoClient.connect(process.env['MONGO_URI'], {useNewUrlParser: true});
    db = client.db(dbName);
  } catch (err) {
    console.log(err.stack);
  }

  if (client) {
    console.log('database client opened')
    try {
      await doFunc(db);
    } catch (err) {
      console.log(err.stack);
    }

    client.close();
  }
  else {
    console.log('failed to open database client')
  }
}

//test if there are database entries for this Order already:
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

//get the order info from Shopify and grab all the interesting bits
//to figure out what, if any, serial numbers are needed.
async function parseOrderInfo (req,res){
  console.log(`email fields ${req.body.customer.email} ${req.body.contact_email}`);
  let email = req.body.contact_email;
  if (!email){
    email = req.body.customer.email
  }
  //if app isn't live, send to me, not customer.
  if(ISLIVE==0){
    email = TESTMAIL;
  }
  const order_num = req.body.name;
  const first_name = req.body.customer.first_name;
  const last_name = req.body.customer.last_name;
  //when order is scanned, we store counts of auths to send out
  let auths_needed = {'bitwig_8ts':0, 'arturia_all':0,'madrona_aalto':0};
// `-----done scanning order. need ${auths_needed.arturia_all} Artu
  console.log(`** Order # ${order_num} from: ${req.body.contact_email} name: ${first_name} ${last_name}`);
  let orderExists_art = false;
  let orderExists_bw = false;
  let orderExists_ml = false;
  if(ISLIVE==1){
    orderExists_art = await ifOrderExists(dbArturia,order_num);
    orderExists_bw = await ifOrderExists(dbBitwig,order_num);
    orderExists_ml = await ifOrderExists(dbAalto,order_num);
  }
  if(orderExists_art || orderExists_bw || orderExists_ml){
    console.log(`the order ${order_num} has already been assigned codes for Arturia: ${orderExists_art}`);
    console.log(`the order ${order_num} has already been assigned serials for Bitwig: ${orderExists_bw}`);
    console.log(`the order ${order_num} has already been assigned codes for Aalto: ${orderExists_ml}`);
    console.log(`--skipping order scan. need ${auths_needed.arturia_all} Arturia licenses and ${auths_needed.bitwig_8ts} Bitwig licenses and ${auths_needed.madrona_aalto} Madrona codes----`);
  }else{
    //scan thru order and count the number of auths we'll need.
    //then, after scanning pass thru a function that gets all the auths
    for (let i in req.body.line_items){
      const title = req.body.line_items[i]['title'];
      const variant = req.body.line_items[i]['variant_title'];
      const quantity = req.body.line_items[i]['quantity'];
      const sku = req.body.line_items[i]['sku'];
      console.log('** Cart Item '+i+': sku '+sku+ ' title '+title+' w/ '+variant+' qty: '+quantity);

      //using real products or is a test POST from shopify.
      // if(ISLIVE==1 || req.body.contact_email==='jon@doe.ca'){
      //   if(title == 'The Sensel Morph with 1 Overlay'){
      //     if(variant=='Music Production' || variant=='Piano' || variant=='Drum Pad' || variant=="Innovator's"){
      //       //provide Arturia and Bitwig code
      //       auths_needed.bitwig_8ts = auths_needed.bitwig_8ts + quantity;
      //       auths_needed.arturia_all = auths_needed.arturia_all + quantity;
      //     }else{
      //       //provide only Arturia
      //       auths_needed.arturia_all = auths_needed.arturia_all + quantity;
      //     }
      //   }
      //   if(title == "Morph Music Maker's Bundle"){
      //     //provide Arturia and Bitwig Codes
      //     auths_needed.bitwig_8ts = auths_needed.bitwig_8ts + quantity;
      //     auths_needed.arturia_all = auths_needed.arturia_all + quantity;
      //   }
      // }
      if(ISLIVE==1 || req.body.contact_email==='jon@doe.ca'){
          let aalto_bundle = false; //need to figure out if order gets aalto
          //title has something like "Morph with Aalto w/ Buchla Thunder" - always has Morph with Aalto
          //can't really do this with SKUs because it's kind of a pain.
          let aalto_check = title.search("Aalto");
          if(aalto_check>-1){
            aalto_bundle=true;
          }
          //The Everything Bundles - lots of variants! Let's shorten it into a variable:
          let everything_bundle = (sku==='S4015' || sku==='S4016' || sku==='S4017' || sku==='S4018' || sku==='S4019' || sku==='S4020' || sku==='S4021' || sku==='S4022' || sku==='S4023' || sku==='S4024' || sku==='S4025' || sku==='S4026' || sku==='S4027' || sku==='S4028' || sku==='S4029' || sku==='S4030' || sku==='S4031' || sku==='S4032');
          //Morph + MP,             Piano,          Drum,        Innovator,        Buchla,      MM Bundle
          let all_and_bw8ts = (everything_bundle || sku==='S4008' || sku==='S4009' || sku==='S4010' || sku==='S4002' || sku==='S4013' || sku ==='S4001'|| sku ==='S4014');
          let all_only = (sku === "S4007" || sku === "S4011" || sku === "S4003" || sku === "S4004" || sku === "S4005" || sku === "S0002");
          let itemname = skunames[sku];
          if(aalto_bundle){
            console.log(`getting Madrona Aalto, Analog Lab Lite, and Bitwig  for ${sku} name ${itemname}`);
            auths_needed.madrona_aalto = auths_needed.madrona_aalto + quantity;
            auths_needed.bitwig_8ts = auths_needed.bitwig_8ts + quantity;
            auths_needed.arturia_all = auths_needed.arturia_all + quantity;
          }else if(all_and_bw8ts){
            console.log(`getting Analog Lab Lite and Bitwig  for ${sku} name ${itemname}`);
            //provide Arturia and Bitwig code
            auths_needed.bitwig_8ts = auths_needed.bitwig_8ts + quantity;
            auths_needed.arturia_all = auths_needed.arturia_all + quantity;
          //Morph +      VEO            Gaming         QWERTY        AZERTY        DVORAK           No Overlay
          }else if(all_only){
            console.log(`getting Analog Lab Lite for ${sku} name ${itemname}`);
            //provide only Arturia
            auths_needed.arturia_all = auths_needed.arturia_all + quantity;
          }
      }

      if(ISLIVE==0){
        //using test products:
        console.log(`## not live ${title}, ${variant}, ${quantity}`)

        let aalto_bundle = false; //need to figure out if order gets aalto
        //title has something like "Morph with Aalto w/ Buchla Thunder" - always has Morph with Aalto
        //can't really do this with SKUs because it's kind of a pain.
        let aalto_check = title.search("Aalto");
        if(aalto_check>-1){
          aalto_bundle=true;
        }
        let everything_bundle = (sku==='S4015' || sku==='S4016' || sku==='S4017' || sku==='S4018' || sku==='S4019' || sku==='S4020' || sku==='S4021' || sku==='S4022' || sku==='S4023' || sku==='S4024' || sku==='S4025' || sku==='S4026' || sku==='S4027' || sku==='S4028' || sku==='S4029' || sku==='S4030' || sku==='S4031' || sku==='S4032');
        //Morph + MP,             Piano,          Drum,        Innovator,        Buchla,      MM Bundle
        let all_and_bw8ts = (sku==='S4008' || sku==='S4009' || sku==='S4010' || sku==='S4002' || sku==='S4013' || sku ==='S4001' || everything_bundle);
        let all_only = (sku === "S4007" || sku === "S4011" || sku === "S4003" || sku === "S4004" || sku === "S4005" || sku === "S0002");
        let itemname = skunames[sku];
        if(aalto_bundle){
          console.log(`getting Madrona Aalto, Analog Lab Lite, and Bitwig  for ${sku} name ${itemname}`);
          auths_needed.madrona_aalto = auths_needed.madrona_aalto + quantity;
          auths_needed.bitwig_8ts = auths_needed.bitwig_8ts + quantity;
          auths_needed.arturia_all = auths_needed.arturia_all + quantity;
        }else if(all_and_bw8ts){
          console.log(`getting Analog Lab Lite and Bitwig  for ${sku} name ${itemname}`);
          //provide Arturia and Bitwig code
          auths_needed.bitwig_8ts = auths_needed.bitwig_8ts + quantity;
          auths_needed.arturia_all = auths_needed.arturia_all + quantity;
        //Morph +      VEO            Gaming         QWERTY        AZERTY        DVORAK           No Overlay
        }else if(all_only){
          console.log(`getting Analog Lab Lite for ${sku} name ${itemname}`);
          //provide only Arturia
          auths_needed.arturia_all = auths_needed.arturia_all + quantity;
        }
        console.log(`testing sku parse - aalto? ${aalto_bundle} everything? ${everything_bundle} - arturia and bitwig? ${all_and_bw8ts} - arturia only? ${all_only} - item Name? ${itemname}`);
        if(title == 'SenselTest'){
          console.log('SENSEL TEST PRODUCT');
          if(variant=="Innovator's"){
            console.log('test: INNOVATOR OVERLAY VARIANT');
            auths_needed.arturia_all = auths_needed.arturia_all + quantity;
          }
          if(variant=="Piano"){
            console.log('test: PIANO OVERLAY VARIANT');
            auths_needed.bitwig_8ts = auths_needed.bitwig_8ts + quantity;
            auths_needed.arturia_all = auths_needed.arturia_all + quantity;
          }
        }
      }

    }//end order scan
    console.log(`-----done scanning order. need ${auths_needed.arturia_all} Arturia licenses and ${auths_needed.bitwig_8ts} Bitwig licenses and ${auths_needed.madrona_aalto} Madrona Aalto codes----`);
  }
  if(ISLIVE==1){
    //now go through db and get the auth keys as needed
    if(auths_needed.arturia_all>0 || auths_needed.bitwig_8ts>0 || auths_needed.madrona_aalto>0){
      let auth_cart = await soft_auths(req,auths_needed);
      // then email the "cart" of authorizations to customer
      await sendTemplate(auth_cart,email);
    }else{
      console.log('no Serials needed for this order');
    }
  }
}
//soft_auths looks for empty order_id fields to find available serial numbers
//returns an object with arrays of serials/authorizations for different titles
//if there are no serials left in the database, instead of arrays, we get -1 returned
async function soft_auths(req,auth){
  // auth.bitwig_8ts is number of bitwig licenses we need to deliver
  // auth.arturia_all is number of arturia licenses we need to deliver
  let cart = {'arturia_all':[],'bitwig_8ts':[],'madrona_aalto':[]};
  //check if this order ID has been processed. sometimes webhooks send mulitples

    console.log(`>> getting authorizations for Arturia: ${auth.arturia_all} and Bitwig: ${auth.bitwig_8ts} and Aalto: ${auth.madrona_aalto} <<`);

    // find the first record where there is no order ID ('lic_docs'), get the license info,
    // then update entry with the new info
    //returns an array of license info. Entry 0 is Arturia, entry 1 is Bitwig.


  let ids = [];
  let index = 0;

  //find the Madrona Aalto auths
  let ml_cart = [];
  ids = [];
  index = 0;
  if(auth.madrona_aalto>0){
    let lic_docs_ml = await dbAalto.find({ order_id: '' }).limit(auth.madrona_aalto);
    for (let doc = await lic_docs_ml.next(); doc != null; doc = await lic_docs_ml.next()) {
        ml_cart[index] = doc.coupon;
        ids[index] = doc._id;
        index++;
        console.log(`AALTO COUPON CODES: ${doc.coupon}`);
      }
    console.log(`check lengths- cart: ${ml_cart.length} vs needed ${auth.madrona_aalto}`)
    if(ml_cart.length===auth.madrona_aalto){
      let j = 0;
      for(let i in ml_cart){
        await update_db(req,ids[i],dbAalto);
        console.log(`++ Aalto sn is ${ml_cart[i]}`);
      }
    }else{
      console.log('Need More Aalto Codes');
      ml_cart = -1;
    }
  }else{
    console.log('No Aalto auths needed')
  }

  //find Arturia auths
  let art_cart = [];
  ids = [];
  index = 0

  let lic_docs_art = await dbArturia.find({ order_id: '' }).limit(auth.arturia_all);
  for (let doc = await lic_docs_art.next(); doc != null; doc = await lic_docs_art.next()) {
      art_cart[index] = [doc.serial,doc.unlock_code];
      ids[index] = doc._id;
      index++;
      console.log(`ARTURIA SERIALS: ${doc.serial}, ${doc.unlock_code}`);
    }
  console.log(`check lengths- cart: ${art_cart.length} vs needed ${auth.arturia_all}`)
  if(art_cart.length===auth.arturia_all){
    for(let i in art_cart){
      await update_db(req,ids[i],dbArturia);
      console.log(`++ Arturia sn and unlock are ${art_cart[i]} id ${ids[i]} - ${i}`);
    }
  }else{
    console.log('Need More Arturia Serial Numbers and Unlock Codes');
    art_cart = -1;
  }

  //find the bitwig auths
  let bw_cart = [];
  ids = [];
  index = 0;
  if(auth.bitwig_8ts>0){
    let lic_docs_bw = await dbBitwig.find({ order_id: '' }).limit(auth.bitwig_8ts);
    for (let doc = await lic_docs_bw.next(); doc != null; doc = await lic_docs_bw.next()) {
        bw_cart[index] = doc.serial;
        ids[index] = doc._id;
        index++;
        console.log(`BW SERIALS: ${doc.serial}`);
      }
    console.log(`check lengths- cart: ${bw_cart.length} vs needed ${auth.bitwig_8ts}`)
    if(bw_cart.length===auth.bitwig_8ts){
      let j = 0;
      for(let i in bw_cart){
        await update_db(req,ids[i],dbBitwig);
        console.log(`++ Bitwig sn is ${bw_cart[i]}`);
      }
    }else{
      console.log('Need More Bitwig Serial Numbers');
      bw_cart = -1;
    }
  }else{
    console.log('No Bitwig auths needed')
  }

  cart.arturia_all = art_cart;
  cart.bitwig_8ts = bw_cart;
  cart.madrona_aalto = ml_cart;

  console.log(`>> lengths: ${cart.arturia_all.length} , ${cart.bitwig_8ts.length} , ${cart.madrona_aalto.length}`);
  console.log(`>> contents: ${cart.arturia_all} , ${cart.bitwig_8ts} , ${cart.madrona_aalto}`);
  return cart;
}

//when we grab a serial number from the database
//we update the database with customer info and order_id
//which essentially marks it as used.
async function update_db (req,rec_id,db_select){
  //abbreviate!
  const email = req.body.contact_email;
  const o_id = req.body.name; //weird they call it name, it's an order number.
  const first_name = req.body.customer.first_name;
  const last_name = req.body.customer.last_name;
  const name = first_name+' '+last_name;

  //update database
  await db_select.updateOne({ _id: rec_id }, { $set: { order_id: o_id, customer_email: email, customer_name: name } });
  console.log('order_id, customer_email, and customer_name added');
}

async function sendTemplate(cart,emailto){
  let art_sn = '';
  let art_uc = '';
  let bw_sn =  '';
  let mla_cc = '';
  let tempFile = '';
  console.log(`>> contents: ${cart.arturia_all} , ${cart.bitwig_8ts} , ${cart.madrona_aalto}`);
  if(cart.arturia_all != -1){
    // create strings of the auth codes from the cart
    for(let i in cart.arturia_all){
      art_sn += cart.arturia_all[i][0]+' <br>';
      art_uc += cart.arturia_all[i][1]+' <br>';
    }
  }else{
    art_sn = 'please contact <a href="mailto:support@sensel.com">support@sensel.com</a> for your Arturia serial numbers.'
  }

  if(cart.bitwig_8ts != -1){
    for(let i in cart.bitwig_8ts){
      bw_sn += cart.bitwig_8ts[i]+' <br>';
    }
  }else{
    bw_sn = 'please contact <a href="mailto:support@sensel.com">support@sensel.com</a> for your Bitwig serial numbers.'
  }
  if(cart.madrona_aalto != -1){
    for(let i in cart.madrona_aalto){
      mla_cc += cart.madrona_aalto[i]+' <br>';
    }
  }else{
    mla_cc = 'please contact <a href="mailto:support@sensel.com">support@sensel.com</a> for your Madrona Labs Aalto coupon code.'
  }

  let templateData = { bitwig_sn: bw_sn, arturia_sn: art_sn, arturia_uc: art_uc, madrona_cc:mla_cc, madrona_name:'',arturia_name:'',bitwig_name:'',splice_code:'splicesenselholiday'};
  // console.log(`arturia : ${art_sn} , ${art_uc} - bitwig : ${bw_sn}`)

  //figure out what email template to use. -1 means we are out of numbers, but customer still should get one.
  if(cart.madrona_aalto.length > 0 || cart.madrona_aalto == -1){
    templateData.madrona_name = 'Madrona Labs';
    templateData.bitwig_name = 'Bitwig';
    templateData.arturia_name = 'and Arturia';
    tempFile = 'art-all_bw-s8t-aalto.ejs';
    console.log('using email template for madrona, arturia and bitwig ');
  } else if(cart.bitwig_8ts.length > 0 || cart.bitwig_8ts == -1){
    templateData.bitwig_name = 'Bitwig';
    templateData.arturia_name = 'and Arturia';
    tempFile = 'art-all_bw-s8t.ejs';
    console.log('using email template for arturia and bitwig ');
  } else {
    templateData.arturia_name = 'Arturia';
    tempFile = 'art-all.ejs';
    console.log('using email template for arturia ');
  }

  const template = __dirname+'/emails/swcodes/'+tempFile; //art-all.ejs or art-all_bw-s8t.ejs or art-all_bw-s8t-aalto.ejs
  console.log('Begin email process....');
  ejs.renderFile(template, templateData , function (err, data) {
    console.log('******')
    if (err) {
        console.log(err);
    } else {
        gmailOptions.to = emailto;
        gmailOptions.subject='Your Music Software from Sensel';
        gmailOptions.html = data;
        console.log(`email to ===> ${emailto} from ${EMAILUSER}`);
        gmail_transporter.sendMail(gmailOptions, function (err, info) {
            if (err) {
                console.log('<--- sendTemplate() error');
                console.log(err);
                //if there's a problem sending the email to the user, warn me at a different email
                sendAltMail();
                console.log('sendTemplate() error --->');
            } else {
                console.log('Message sent: ' + info.response);
            }
        });
    }
  });
}

async function sendAdminMail() {
  gmailOptions.to=ADMINMAIL;
  gmailOptions.html = '';
  gmail_transporter.sendMail(gmailOptions, function (err, info) {
      if (err) {
            console.log('<--- sendAdminMail() error');
            console.log(err);
            //if there's a problem sending the email to the user, warn me at a different email
            sendAltMail();
            console.log('sendAdminMail() error --->');
      } else {
          console.log('Message sent: ' + info.response);
      }
  });
  return 'email sent';
}

async function sendAltMail() {
  nmail_transporter.sendMail(nmailOptions, function (err, info) {
      if (err) {
          console.log(err);
      } else {
          console.log('Alt Email Message sent: ' + info.response);
      }
  });
  return 'alternate email sent';
}

async function check_counts(){
  let count = await dbBitwig.countDocuments({ order_id: '' });
  console.log('remaining bitwig:'+count);
  if(count<WARNING_COUNT){
    gmailOptions.subject = `Bitwig Serial count is < ${WARNING_COUNT}`;
    gmailOptions.text = `Bitwig Serial count is < ${WARNING_COUNT}`;
    if(RUNTEST==0) await sendAdminMail();
  }

  count = await dbArturia.countDocuments({ order_id: '' });
  console.log('remaining arturia:'+count);
  if(count<WARNING_COUNT){
    gmailOptions.subject = `Arturia Serial count is < ${WARNING_COUNT}`;
    gmailOptions.text = `Arturia Serial count is < ${WARNING_COUNT}`;
    if(RUNTEST==0) await sendAdminMail();
  }

  count = await dbAalto.countDocuments({ order_id: '' });
  console.log('remaining Aalto:'+count);
  if(count<WARNING_COUNT){
    gmailOptions.subject = `Aalto Coupon count is < ${WARNING_COUNT}`;
    gmailOptions.text = `Aalto Coupon count is < ${WARNING_COUNT}`;
    if(RUNTEST==0) await sendAdminMail();
  }
}

///SETUP Email service
///with google
const gmail_transporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
        user: EMAILUSER,
        pass: EMAILPASS
    }
});

// setup email data for google sender
const gmailOptions = {
    from: EMAILUSER, // sender address
    to: 'someone@somewhere.com', // list of receivers
    subject: 'Your Free Music Software from Sensel', // Subject line
    text: 'Serial number authorizations', // plain text body
};

//Alternate email setup:
///SETUP Email service for nbor email
const nmail_transporter = nodemailer.createTransport({
    host: 'sub5.mail.dreamhost.com',
    port: 465,
    secure: true,
    auth: {
        user: NMAIL,
        pass: NPASS
    }
});
// setup email data with unicode symbols
const nmailOptions = {
    from: '"Node App" <node@nbor.us>', // sender address
    to: 'p@nbor.us', // list of receivers
    subject: 'Alternate Mail From Node App', // Subject line
    text: 'There is a Problem with GMAIL', // plain text body
};

async function process_post(req, res) {
  console.log('Incoming order!...');
  let hash = 0;
  let hmac = 1;
  if(RUNTEST==0){
    // We'll compare the hmac to our own hash
    hmac = req.get('X-Shopify-Hmac-Sha256');
    console.log(`signature from order post: ${hmac}`);
    // Use raw-body to get the body (buffer)
    const body = JSON.stringify(req.body);
    // Create a hash using the body and our key
    hash = crypto
      .createHmac('sha256', SHOPSECRET)
      .update(req.rawbody, 'utf8', 'hex')
      .digest('base64');
  }else{
    hash = 1;
  }
  // Compare our hash to Shopify's hash
  if (hash === hmac) {
    // It's a match! All good
    console.log('Authorized Order from Shopify!');
    res.sendStatus(200);
    await dbDo(async (db) => {
      dbBitwig = db.collection('bitwig-licenses');
      dbArturia = db.collection('arturia-licenses');
      dbAalto = db.collection('aalto-licenses');
      await check_counts();
      //Order came from Shopify, so we'll parse the info and email the customer relevant software licenses.
      await parseOrderInfo(req,res);
    });

  } else {
    // No match! This request didn't originate from Shopify
    console.log('Danger! Not from Shopify!');
    res.sendStatus(403);
  }

}
async function process_reg(req, res) {
  //get email address from the Registration webhook then send them a BWS8T and ALL licenses. No need to process for Madrona Labs Aalto.
    // It's a match! All good
    console.log('>>Authorized Registration from Shopify!');
    res.sendStatus(200);
    await dbDo(async (db) => {
      dbBitwig = db.collection('bitwig-licenses');
      dbArturia = db.collection('arturia-licenses');
      //no need to check for Aalto because that is only available through shopify purchase. This is for registration.
      let email = req.body.customer.email;
      console.log('------------------')
      console.log(`email ${email}`)
      //make sure we have licenses:
      await check_counts();
      //serial number registered, so we send 1 of each license.

      //a bit clunky, but cut and pasted from parseOrderInfo():
      if(ISLIVE==1){
        let auths_needed = {'bitwig_8ts':0, 'arturia_all':0}; //no need for madrona_aalto in here
        auths_needed.arturia_all = 1;
        auths_needed.bitwig_8ts = 1;
        //no need to check for Aalto because that is only available through shopify purchase
        if(auths_needed.arturia_all>0 || auths_needed.bitwig_8ts>0){
          let auth_cart = await soft_auths(req,auths_needed);
          // then email the "cart" of authorizations to customer
          await sendTemplate(auth_cart,email);
        }else{
          console.log('no Serials needed for this order');
        }
      }else{
        console.log(`fake sending licenses to ${email}`)
      }

    });

}

async function main() {
  await dbDo(async (db) => {
    dbBitwig = db.collection('bitwig-licenses');
    dbArturia = db.collection('arturia-licenses');
    dbAalto = db.collection('aalto-licenses');
    //not currently using SNs, but here for future ref:
    dbMorphSNs = db.collection('morph-serials');
    //check the serial counts on start:
    await check_counts();
  });

  // create a server that listens for URLs with order info.
  express()
    .use(express.static(path.join(__dirname, 'public')))
    .use(bodyParser.json({
        type:'application/json',
        limit: '50mb',
        verify: function(req, res, buf) {
            if (req.url.startsWith('/')){
              req.rawbody = buf;
            }
        }
    })
    )
    .use(bodyParser.urlencoded({ extended: true }))

    .get('/', function(req, res) {
      res.send('<a href="http://sensel.com">SENSEL</a>').status(200);
    })
    .post('/', async function(req, res) {
      process_post(req,res);
    })
    .post('/morph_registration', async function(req, res) {
      process_reg(req,res);
    })
    .post('/shopify/webhook', async function(req, res) {
      process_post(req,res);
    })

    .listen(SERVER_PORT, () => console.log(`We're listening on ${ SERVER_PORT }`));
}
main();

//for testing with JSON files instead of POST from Shopify
async function readTest(file) {
  return new Promise((resolve, reject) => {
    // test_order_morph.json
    // test_order_case.json
    // test_order_morphbundle_complete.json
    // test_order_morphbundle.json
    // test_order_senseltestpiano.json
    fs.readFile('testorders/test_order_morphbundle_aalto.json', 'utf8', (err, data) => {
      if (err) reject(err);
      else resolve(data);
    });
  });
}

async function runTestOrder(){
  let res = {};
  res['sendStatus'] = function(){console.log('---sendStatus---')};
  let request = {};
  let testOrder;
  let data=await readTest();
  testOrder = JSON.parse(data);
  request['body'] = testOrder;
  process_post(request,res);
}

if(RUNTEST==1) runTestOrder();
