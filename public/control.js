var Control = {
    initialize: function() {
        var that = this;
        this.socket = io.connect('http://localhost');
        $('.thumbnail').click(function(){
            var id = $(this).prop('id');
            that.socket.emit('switch', {id: id});
        })
    }
};

$(function(){
    Control.initialize();
})