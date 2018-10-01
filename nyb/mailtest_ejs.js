require('dotenv').config();
const nodemailer = require('nodemailer');
const EMAIL = process.env.EMAIL_USER;
const EPASS = process.env.EMAIL_PASS;
const GPASS = process.env.GMAIL_PASS;
// Generate test SMTP service account from ethereal.email
// Only needed if you don't have a real mail account for testing
nodemailer.createTestAccount((err, account) => {
    // create reusable transporter object using the default SMTP transport
    let transporter = nodemailer.createTransport({
        //host: 'sub5.mail.dreamhost.com',
        //port: 465,
        service: 'Gmail',
        // secure: true,
        auth: {
            user: 'peter@sensel.com',
            pass: GPASS
        }
    });

    // setup email data with unicode symbols
    let mailOptions = {
        from: '"Node App" <peter@sensel.com>', // sender address
        to: 'p@nbor.us', // list of receivers
        subject: 'Hello ✔', // Subject line
        text: 'Hello world?', // plain text body
        html: '<b>Hello world?</b>' // html body
    };

    // send mail with defined transport object
    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            return console.log(error);
        }
        console.log('Message sent: %s', info.messageId);
        // Preview only available when sending through an Ethereal account
        console.log('Preview URL: %s', nodemailer.getTestMessageUrl(info));

        // Message sent: <b658f8ca-6296-ccf4-8306-87d57a0b4321@example.com>
        // Preview URL: https://ethereal.email/message/WaQKMgKddxQDoou...
    });
});
