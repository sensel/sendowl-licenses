//may want to encrypt the database. here's how https://lollyrock.com/articles/nodejs-encryption/

// https://github.com/louischatriot/nedb
// Type 3: Persistent datastore with automatic loading
const dbname='db/art_test'
var Datastore = require('nedb');
var db =  new Datastore({ filename: dbname, autoload: true });
db.count({}, function (err, count) {
  console.log('db count '+count)
});

//in case I want to see all the records
function printfinds(query){
  db.find(query, function (err, docs) {
    console.log("-------finds---------");
    console.log(docs);
    console.log("----------------");
  });
}

//printfinds({order_id:''});

// find the first record where there is no order ID
async function findsingle(){
  db.findOne({ order_id: '' }, function (err, onedoc) {
    console.log(onedoc);
    var id=onedoc._id;
    console.log(id+'*******')
    return id;
  });
}

async function updatesingle(id){
    console.log(id+' $$$')
    db.update({ _id: id }, { $set: { order_id: 432 } }, { multi: false }, function (err, numReplaced) {
      console.log(numReplaced); //how many records got updated? should be 1
    });
}

var items=[0,1,2];
console.log('++++++++++++')
async function find_update(items){
  for (const i in items){
    var id = await findsingle();
    await updatesingle(id);
  }
}
find_update(items);
