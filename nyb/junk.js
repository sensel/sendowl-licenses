function bobj(){
  var boo = {};
  boo['owl'] = 'hoo';
  boo['bat'] = ['fruit','moth'];

  return boo
}

function wee(){
  var cart = new bobj();
  console.log(cart.owl);
  console.log(cart.bat[0]);
}

wee();
