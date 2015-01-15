var lwip            = require('lwip'),
    Q               = require('q'),
    fs              = require('fs'),
    ffmpeg          = require('fluent-ffmpeg'),
    imageExtensions = ['jpg', 'jpeg', 'png'],
    videoExtensions = ['mov', 'mp4', 'm4v', 'avi'];

var cropImage = function(image, filen, filext, rows, columns, colwidth, rowheight, i, j, outpath) {
    var left = (colwidth * j),
        top =  (rowheight * i),
        right = (colwidth * j) + colwidth,
        bottom = (rowheight * i) + rowheight,
        deferred = Q.defer();

    image.clone(function(err, img) {
        if (err) {
            console.log('Error cloning image', err);
            deferred.reject(err);
        } else {
            img.crop(left, top, right, bottom, function(err, cropped) {
                cropped.writeFile(outpath + filen+'_'+i+'x'+j+'.'+filext, function(err) {
                    if (err)  {
                        console.error('Error saving image crop', err);
                        deferred.reject(err);
                    } else {
                        deferred.resolve(i+'x'+j);
                    }
                });
            });
        }
    });

    return deferred.promise;
};

var chunkImage = function (path, name, columns, rows, outpath) {
    var filen = name.split('.')[0],
        filext = name.split('.').pop(),
        crops = [],
        deferred = Q.defer();
    
    lwip.open(path, function(err, image){
        if (err) {
            console.error('Error opening image', path);
        } else {
            var width = image.width(),
                height = image.height(),
                colwidth = width / columns,
                rowheight = height / rows;

            for (var i = 0; i < rows; i++) {
                for (var j = 0; j < columns; j++) {
                    crops.push(cropImage(image, filen, filext,rows, columns, colwidth, rowheight, i, j, outpath));
                }
            }

            Q.all(crops)
            .then(function(){
                deferred.resolve(rows*columns);
            })
            .catch(function(err){
                deferred.reject(err);
            });
        }
    });
    
    return deferred.promise;
};

var getVideoDimensions = function(path) {
    var deferred = Q.defer();
    
    ffmpeg.ffprobe(path, function(err, metadata) {
        if (err) {
            deferred.reject('Error opening video'+ path);
        } else {
            var width = false, 
                height = false;

            for (var i in metadata.streams) {
                if (metadata.streams[i].codec_type === 'video') {
                    width = metadata.streams[i].width;
                    height = metadata.streams[i].height;
                }
            }
            
            if (!width && !height) {
                deferred.reject('Cannot get video dimensions');
            } else {
                deferred.resolve({
                    width: width,
                    height: height
                });
            }
        }
    });
    
    return deferred.promise;
};

var cropVideo = function(video, filen, filext, rows, columns, colwidth, rowheight, i, j, outpath) {
    var left = (colwidth * i),
        top =  (rowheight * j),
        deferred = Q.defer();
    
    console.log('coords: '+i+'x'+j+', crop='+colwidth+':'+rowheight+':'+left+':'+top);
    video
    .videoFilter('crop='+colwidth+':'+rowheight+':'+left+':'+top) //crop=out_width:out_height:x:y
    .save(outpath + filen+'_'+i+'x'+j+'.'+filext)
    .on('end', function() {
        deferred.resolve(i+'x'+j);
    })
    .on('error', function(err) {
        deferred.reject(err);
    });

    return deferred.promise;
};

var chunkVideo = function (path, name, columns, rows, outpath) {
    var filen = name.split('.')[0],
        filext = name.split('.').pop(),
        crops = [],
        deferred = Q.defer();

    var video = ffmpeg(path);
    
    getVideoDimensions(path)
    .then(function(dimensions){
        var width = dimensions.width,
            height = dimensions.height,
            colwidth = width / columns,
            rowheight = height / rows;

        for (var i = 0; i < rows; i++) {
            for (var j = 0; j < columns; j++) {
                crops.push(cropVideo(video, filen, filext, rows, columns, colwidth, rowheight, i, j, outpath));
            }
        }

        Q.all(crops)
        .then(function(){
            deferred.resolve(rows*columns);
        })
        .catch(function(err){
            deferred.reject(err);
        });
    });

    return deferred.promise;
};

var chunkFile = function(path, name, columns, rows, outpath) {
    var filen = name.split('.')[0],
        filext = name.split('.').pop().toLowerCase();
    
    if (imageExtensions.indexOf(filext) > -1) {
        return chunkImage(path, name, columns, rows, outpath);
    } else if (videoExtensions.indexOf(filext) > -1) {
        return chunkVideo(path, name, columns, rows, outpath);
    } else {
        var deferred = Q.defer();
        deferred.reject('File Type not identified: '+filext);
        return deferred.promise;
    }
};

var getAllFiles = function(db) {
    var deferred = Q.defer();
    
    db.find({}, function (err, docs) {
        if (err) {
            deferred.reject('Error retrieving files' + err);
        } else {
            deferred.resolve(docs);
        }
    });
    
    return deferred.promise;
};

var removeImages = function(image, outpath) {
    console.log(image);
    var rows = image.rows,
        columns = image.columns,
        name = image.filename,
        filen = name.split('.')[0],
        filext = name.split('.').pop(),
        deletions = 0;
    
    for (var i = 0; i < rows; i++) {
        for (var j = 0; j < columns; j++) {
            var file = outpath + filen+'_'+i+'x'+j+'.'+filext;
            fs.unlinkSync(file);
            deletions++;
        }
    }
    fs.unlinkSync(image.path);
    deletions++;
    
    console.log(deletions+' files deleted of '+image.chunks+' chunks + 1 original');
    return deletions;
};

var getLinks = function(image) {
    var links = [],
        rows = image.rows,
        columns = image.columns;
    
    for (var i = 0; i < rows; i++) {
        for (var j = 0; j < columns; j++) {
            links.push('/screen/'+i+'x'+j);
        }
    }
    
    return links;
};

module.exports = {
    chunkFile: chunkFile,
    getAllFiles: getAllFiles,
    removeImages: removeImages,
    getLinks: getLinks
};