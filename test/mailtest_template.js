require('dotenv').config();
const nodemailer = require('nodemailer');
const path = require('path');

const fs = require('fs');
const ejs = require("ejs");

const EMAIL = process.env.EMAIL_USER;
const EPASS = process.env.EMAIL_PASS;
const GMAIL = process.env.GMAIL_USER;
const GPASS = process.env.GMAIL_PASS;
//to pass to email template
var bw_sn = 'XYZ-123-BITW';
var art_sn = '456-555-ART';
var art_uc = 'GOON-BOON-MOON-ART';

var template = __dirname+'/emails/swcodes/art-all.ejs';
var file = fs.readFileSync(template,'utf8');

///with google
var gmail_transporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
        user: GMAIL,
        pass: GPASS
    }
});

// setup email data with unicode symbols
var gmailOptions = {
    from: '"Sensel - Your Free Software" <peter@sensel.com>', // sender address
    to: 'p@nbor.us', // list of receivers
    subject: 'From Node App', // Subject line
    text: 'Hello world', // plain text body
};

// send mail with defined transport object
function sendgmail(){
    gmail_transporter.sendMail(gmailOptions, (error, info) => {
        if (error) {
            return console.log(error);
        }
        console.log('Message sent: %s', info.messageId);
    });
}


function sendTemplate(){

  var templateData = { arturia_sn: art_sn,arturia_uc: art_uc};
  console.log('Begin....');
  ejs.renderFile(template, templateData , function (err, data) {
    console.log('******')
    if (err) {
        console.log(err);
    } else {
        gmailOptions.html = data;
        console.log("======================>");
        gmail_transporter.sendMail(gmailOptions, function (err, info) {
            if (err) {
                console.log(err);
            } else {
                console.log('Message sent: ' + info.response);
            }
        });
    }
  });
}

sendTemplate();
