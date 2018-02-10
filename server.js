'use strict';

var MongoClient = require('mongodb').MongoClient;
var client = require('socket.io').listen(3000).sockets;
var url = "mongodb://admin:admin@ds012058.mlab.com:12058/livechatdatabase";

var os = require('os');
var nodeStatic = require('node-static');
var http = require('http');
var socketIO = require('socket.io');

var fileServer = new(nodeStatic.Server)();
var app = http.createServer(function(req, res) {
  fileServer.serve(req, res);
}).listen(7777);

var io = socketIO.listen(app);
io.sockets.on('connection', function(socket) {

  // convenience function to log server messages on the client
  function log() {
    var array = ['Message from server:'];
    array.push.apply(array, arguments);
    socket.emit('log', array);
  }

  socket.on('message', function(message) {
    log('Client said: ', message);
    // for a real app, would be room-only (not broadcast)
    socket.broadcast.emit('message', message);
  });

  socket.on('create or join', function(room) {
    log('Received request to create or join room ' + room);

    var numClients = io.sockets.sockets.length;
    log('Room ' + room + ' now has ' + numClients + ' client(s)');

    if (numClients === 1) {
      socket.join(room);
      log('Client ID ' + socket.id + ' created room ' + room);
      socket.emit('created', room, socket.id);

    } else if (numClients === 2) {
      log('Client ID ' + socket.id + ' joined room ' + room);
      io.sockets.in(room).emit('join', room);
      socket.join(room);
      socket.emit('joined', room, socket.id);
      io.sockets.in(room).emit('ready');
    } else { // max two clients
      socket.emit('full', room);
    }
  });

  socket.on('ipaddr', function() {
    var ifaces = os.networkInterfaces();
    for (var dev in ifaces) {
      ifaces[dev].forEach(function(details) {
        if (details.family === 'IPv4' && details.address !== '127.0.0.1') {
          socket.emit('ipaddr', details.address);
        }
      });
    }
  });

  socket.on('bye', function(){
    console.log('received bye');
  });

  
});

MongoClient.connect(url, function (err, db) {
  if (err)
      throw err;

  client.on('connection', function (socket) {
      setInterval(function () {
          socket.emit('inputmessagesResult', {

          });
      },1000);
      socket.on('input', function (data) {
          console.log("recieved " + data.email + " on server side");
          var query = {
              Email: data.email
          };
          var arr = db.collection("users").find(query, {
              _id: 0
          }).toArray(function (err, result) {
              if (err) {
                  socket.emit('output', { answer: -1 });
                  throw err;
              }
              else {
                  var st = [];
                  for (var k in result)
                      st = result[k];

                  if (typeof st.Password === 'undefined') {
                      socket.emit('output', {
                          answer: -1
                      });
                  } else {
                      var kn = st.Password.localeCompare(data.password);
                      socket.emit('output', {
                          answer: kn,
                          username: st.Username
                      });
                  }

              }
          });

      });

      


      socket.on('checkName', function (data) {
          db.collection("users").find({ "Username": data.user }).toArray(function (err, res) {
              if (err) {
                  throw err;
              }
              socket.emit('nameResult', res);
          })
      });

      socket.on('addUser', function (data) {
          db.collection("users").insert({ FirstName: data.FirstName, LastName: data.LastName, Email: data.Email, Username: data.Username, Password: data.Password }, function () {
              console.log("User inserted succefully...");
              socket.emit("addUserResult", {})
          })
      });
      // Handle input events
      socket.on('inputmessages', function (data) {
          console.log('starting to insert message in database');
          let name = data.name;
          let recieve = data.recievedby;
          let message = data.message;

          console.log('name is ' + name);
          console.log('reciever is ' + recieve);
          console.log('message is ' + message);

          // Check for name and message
          if (message == '') {
              // Send error status
              //sendStatus('Please message');
          } else {
              // Insert message
              db.collection("conversations").update({ accountname: name, reciever: recieve }, { $push: { messages: { sender: message } } }, function (err, recs, status) {
                  if (err)
                      throw err;
                  // console.log("records:" + recs);
                  // var st = [];
                  // for (var k in recs)
                  //     st = recs[k];

                  // console.log("type of st is " + typeof st);
                  // if (recs == 0) {
                  db.collection("conversations").update({ accountname: recieve, reciever: name }, { $push: { messages: { reciever: message } } });
                  //}
                  socket.emit('refresh');
              });

          }
      });


      socket.on("getContactList", function (data) {
          console.log("Name recieved to search friends : " + data.Username);
          db.collection("friends").find({ Username: data.Username }).toArray(function (err, res) {
              var st = [];
              for (var k in res)
                  st = res[k];
              console.log(st.Friends + " type of FRIENDS : " + typeof st.Friends);
              socket.emit("getContactListResult", { Friends: st.Friends });
          });
      });

      socket.on('getMessages', function (data) {
          var searchname = data.friendname;
          console.log("search name is " + searchname);
          db.collection("conversations").find({ accountname: data.accountName, reciever: searchname }).toArray(function (err, res) {
              if (err) {
                  console.log("could not find messages");
              }
              var st = [];
              for (var k in res)
                  st = res[k];

              //console.log(st.messages+" type of messages "+typeof st.messages);
              //var arr=st.messages;
              //var f=arr[0];
              //console.log(f.other);
              if (st.messages !== undefined && searchname !== "")
                  socket.emit('getMessagesResult', { mess: st.messages });
              else {
                  db.collection("conversations").find({ accountname: searchname, reciever: data.accountName }).toArray(function (err, res) {
                      var st = [];
                      for (var k in res)
                          st = res[k];

                      if (st.messages !== undefined && searchname !== "")
                          socket.emit('getMessagesResult', { mess: st.messages, reverse: true });
                      else
                          console.log("could not find messages");
                  });
              }
          });
      })
  });
});
