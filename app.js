var express = require('express'),
    app     = express(),
    server  = require('http').Server(app),
    io      = require('socket.io')(server),
    multer  = require('multer'),
    Q       = require('q');
    Store   = require('nedb'),
    helpers = require('./lib/helpers'),
    db      = new Store({ filename: __dirname + '/data/files.db' }),
    maxlat  = 0,
    screens = 0,
    uppath  = __dirname + '/public/uploads/',
    pubpath = __dirname + '/public/',
    currentFile = false,
    loaded  = 0;

server.listen(9000);

db.loadDatabase(function (err) {    // Callback is optional
    if (err) {
        console.error('Error loading db', err);
    }
});

app.use(express.static(pubpath));
app.use(multer({ dest: uppath}))

app.set('view engine', 'ejs');

app.get('/screen/:coords', function (req, res) {
    console.log(req.params);
    var coords = req.params.coords;
    res.render(pubpath + 'index.ejs', {coords: coords});
});

app.get('/upload', function(req, res) {
    res.render(pubpath + 'upload.ejs', {success: false, error: false, errormsg: false}); 
});

app.get('/', function(req, res) {
    helpers.getAllFiles(db)
    .then(function(docs){
        res.render(pubpath + 'control.ejs', {files: docs});
    })
    .catch(function(err) {
        res.render(pubpath + 'control.ejs', {files:[], error: err});
    });
});

app.get('/delete/:id', function(req, res) {
    var id = req.params.id;
    
    db.find({_id: id}, function(err, doc) {
        if (err) {
            res.render(pubpath + 'control.ejs', {error: 'Error while deleting file', files: []});
        } else {
            db.remove({_id: id}, {}, function(err, nr) {
                helpers.getAllFiles(db)
                .then(function(docs){
                    if (err) {
                        res.render(pubpath + 'control.ejs', {error: err, files: docs});
                    } else if(nr > 0) {
                        helpers.removeImages(doc[0], uppath);
                        res.render(pubpath + 'control.ejs', {success: 'File removed successfully', files: docs});
                    } else {
                        res.render(pubpath + 'control.ejs', {error: 'File not found', files: docs});
                    }
                });
            });
        }
    });
});

app.post('/upload', function (req, res) {
    console.log(req.body);
    console.log(req.files);
    
    helpers.chunkFile(req.files.image.path, req.files.image.name, req.body.columns, req.body.rows, uppath)
    .then(function(chunks) {
        console.log('Chunks finished! With '+chunks+' chunks');
        
        var file = {
            name: req.body.name,
            columns: req.body.columns,
            rows: req.body.rows,
            filename: req.files.image.name,
            path: req.files.image.path,
            extension: req.files.image.extension,
            size: req.files.image.size,
            chunks: chunks,
            type: helpers.getType(req.files.image.name)
        };
        
        console.log('Trying to insert file', file);

        db.insert(file, function(err, newDoc) {
            if (err) {
                console.error('Error inserting new file', err);
                res.render(pubpath + 'upload.ejs', {success: false, error: true, errormsg: err}); 
            } else {
                console.log('New doc inserted successfuly', newDoc._id);
                res.render(pubpath + 'upload.ejs', {success: true, error:false, errormsg: false, links: helpers.getLinks(newDoc)}); 
            }
        });
    })
    .catch(function(err) {
        console.error('Chunking failed, aborting', err);
        res.render(pubpath + 'upload.ejs', {success: false, error: true, errormsg: err}); 
    });
});

io.on('connection', function (socket) {
    socket.isScreen = false;
    
    socket.emit('ping', { start: Date.now() });
    
    socket.on('pong', function (data) {
        data = data.data;
        var lat = ( data.end - data.start ) / 2;
        maxlat = Math.max(maxlat, lat);
        console.log('Max latency is '+maxlat);
        screens++;
        socket.isScreen = true;
        console.log('New screen connection, screens: '+screens);
    });
    
    socket.on('disconnect', function () {
        if (socket.isScreen) {
            screens--;
            console.log('Screen disconnected, screens: '+screens);
        }
    });
    
    socket.on('switch', function(data) {
        db.find({_id: data.id}, function(err, doc){
            if (err) {
                console.error('Image '+data.id+' not found', err);
            } else {
                currentFile = doc[0];
                loaded = 0;
                console.log('Broadcast switch', doc);
                socket.broadcast.emit('switch', {file: doc});
            }
        });
    });
    
    socket.on('loaded', function(data) {
        loaded++;
        console.log('Screens loaded: '+loaded);
        console.log('Chunks: '+currentFile.chunks);
        if (loaded == currentFile.chunks) {
            var when = Date.now() + maxlat;
            console.log('Emit show');
            io.sockets.emit('show', {when: when});
        }
    });
});