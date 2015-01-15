var App = {
    initialize: function() {
        var that = this;
        this.imageExtensions = ['jpg', 'jpeg', 'png'],
        this.videoExtensions = ['mov', 'mp4', 'm4v', 'avi'];
        this.coords = coords;
        this.socket = io.connect('http://localhost');
        this.socket.on('ping', function (data) {
            console.log(data);
            data.end = Date.now();
            that.socket.emit('pong', { data: data });
        });
        console.log(this.coords);
        this.socket.on('switch', function(file) {
            console.log(file);
            file = file.file[0];
            var name = file.filename.split('.')[0],
                ext = file.filename.split('.').pop(),
                coords = that.coords;
            
            console.log('Switch to', file.filename);
            console.log('Background img', '/uploads/'+name+'_'+that.coords+'.'+ext);
            
            if (that.imageExtensions.indexOf(ext) > -1) {
                that.img = new Image();
                that.img.src = '/uploads/'+name+'_'+coords+'.'+ext;
                that.img.onload = function() {
                    that.socket.emit('loaded', { coords: that.coords});
                }
                
            } else 
            if (that.videoExtensions.indexOf(ext) > -1) {
                that.video = document.createElement('video');
                that.video.src = '/uploads/'+name+'_'+coords+'.'+ext;
                that.video.oncanplaythrough = function() {
                    that.socket.emit('loaded', { coords: that.coords});
                }
            }
        });
        
        this.socket.on('show', function(data) {
            if (typeof that.img !== 'undefined') {
                setTimeout(function(){
                    $('body').css('background-image', 'url('+that.img.src+')');
                    console.log(Date.now());
                }, data.late);
            } else if (typeof that.video !== 'undefined') {
                setTimeout(function(){
                    $('body').append(that.video);
                    that.video.play();
                    console.log(Date.now());
                }, data.late);
            }
        })
    }
};

$(function(){
    App.initialize();
})