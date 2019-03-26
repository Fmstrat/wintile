const Lang = imports.lang
const Meta = imports.gi.Meta
const Shell = imports.gi.Shell
const Main = imports.ui.main
const Mainloop = imports.mainloop;

let _close = 50;
var debug = false;

var _log = function(){}
if (debug)
	_log = log.bind(window.console);


const KeyManager = new Lang.Class({
    Name: 'MyKeyManager',

    _init: function() {
        this.grabbers = new Map()

        global.display.connect(
            'accelerator-activated',
            Lang.bind(this, function(display, action, deviceId, timestamp){
                _log('Accelerator Activated: [display={}, action={}, deviceId={}, timestamp={}]',
                    display, action, deviceId, timestamp)
                this._onAccelerator(action)
            }))
    },

    listenFor: function(accelerator, callback){
        _log('Trying to listen for hot key [accelerator={}]', accelerator)
        let action = global.display.grab_accelerator(accelerator)

        if(action == Meta.KeyBindingAction.NONE) {
            _log('Unable to grab accelerator [binding={}]', accelerator)
        } else {
            _log('Grabbed accelerator [action={}]', action)
            let name = Meta.external_binding_name_for_action(action)
            _log('Received binding name for action [name={}, action={}]',
                name, action)

            _log('Requesting WM to allow binding [name={}]', name)
            Main.wm.allowKeybinding(name, Shell.ActionMode.ALL)

            this.grabbers.set(action, {
                name: name,
                accelerator: accelerator,
                callback: callback,
                action: action
            })
        }

    },

    _onAccelerator: function(action) {
        let grabber = this.grabbers.get(action)

        if(grabber) {
            this.grabbers.get(action).callback()
        } else {
            _log('No listeners [action={}]', action)
        }
    }
})

function isClose(a, b) {
	if (a <= b && a > b - _close)
		return true;
	else if (a >= b && a < b + _close)
		return true;
	else
		return false;
}

function getPosition(app, space) {
	let window = app.get_frame_rect()
	_log("window.x: "+window.x+" window.y: "+window.y+" window.width: "+window.width+" window.height: "+window.height)
	_log("space.x: "+space.x+" space.y: "+space.y+" space.width: "+space.width+" space.height: "+space.height+" space.width/2: "+Math.floor(space.width/2)+" space.height/2: "+Math.floor(space.height/2))
	if (isClose(window.x, space.x) && isClose(window.y, space.y)) {
		// X,Y in upper left
		if (isClose(window.height, space.height) && isClose(window.width, space.width)) {
			// Maximized
			return "maximized"
		} else if (isClose(window.height, space.height) && isClose(window.width, space.width/2)) {
			// Left
			return "left"
		} else if (isClose(window.height, space.height/2) && isClose(window.width, space.width)) {
			// Top
			return "top"
		} else if (isClose(window.height, space.height/2) && isClose(window.width, space.width/2)) {
			// Top-left
			return "topleft"
		}
	} else if (isClose(window.x, space.width/2+space.x) && isClose(window.y, space.y)) {
		// X, Y in middle upper
		if (isClose(window.height, space.height) && isClose(window.width, space.width/2)) {
			// Right
			return "right"
		} else if (isClose(window.height, space.height/2) && isClose(window.width, space.width/2)) {
			// Top-right
			return "topright"
		}
	} else if (isClose(window.x, space.x) && isClose(window.y, space.height/2+space.y)) {
		// X, Y in middle left
		if (isClose(window.height, space.height/2) && isClose(window.width, space.width)) {
			// Bottom
			return "bottom"
		} else if (isClose(window.height, space.height/2) && isClose(window.width, space.width/2)) {
			// Bottom-left
			return "bottomleft"
		}
	} else if (isClose(window.x, space.width/2+space.x) && isClose(window.y, space.height/2+space.y)) {
		// X, Y in middle
		if (isClose(window.height, space.height/2) && isClose(window.width, space.width/2)) {
			// Bottom-right
			return "bottomright"
		}
	}
	// Floating
	return "floating"
}

function placeWindow(loc, app) {
	_log("placeWindow: " + loc);
	let x, y, w, h = 0
	var space = app.get_work_area_current_monitor()
	switch (loc) {
		case "left":
			x = space.x;
			y = space.y;
			w = Math.floor(space.width/2);
			h = space.height;
			if (!app.maximizedVertically)
				app.maximize(Meta.MaximizeFlags.VERTICAL)
			if (app.maximized_horizontally)
				app.unmaximize(Meta.MaximizeFlags.HORIZONTAL);
			app.move_resize_frame(true, x, y, w, h)
			break;
		case "topleft":
			x = space.x;
			y = space.y;
			w = Math.floor(space.width/2);
			h = Math.floor(space.height/2);
			if (app.maximized_horizontally || app.maximizedVertically)
				app.unmaximize(Meta.MaximizeFlags.HORIZONTAL | Meta.MaximizeFlags.VERTICAL);
			app.move_resize_frame(true, x, y, w, h)
			break;
		case "bottomleft":
			x = space.x;
			y = Math.floor(space.height/2)+space.y;
			w = Math.floor(space.width/2);
			h = Math.floor(space.height/2);
			if (app.maximized_horizontally || app.maximizedVertically)
				app.unmaximize(Meta.MaximizeFlags.HORIZONTAL | Meta.MaximizeFlags.VERTICAL);
			app.move_resize_frame(true, x, y, w, h)
			break;
		case "right":
			x = Math.floor(space.width/2+space.x);
			y = space.y;
			w = Math.floor(space.width/2);
			h = space.height;
			if (!app.maximizedVertically)
				app.maximize(Meta.MaximizeFlags.VERTICAL)
			if (app.maximized_horizontally)
				app.unmaximize(Meta.MaximizeFlags.HORIZONTAL);
			app.move_resize_frame(true, x, y, w, h)
			break;
		case "topright":
			x = Math.floor(space.width/2+space.x);
			y = space.y;
			w = Math.floor(space.width/2);
			h = Math.floor(space.height/2);
			if (app.maximized_horizontally || app.maximizedVertically)
				app.unmaximize(Meta.MaximizeFlags.HORIZONTAL | Meta.MaximizeFlags.VERTICAL);
			app.move_resize_frame(true, x, y, w, h)
			break;
		case "bottomright":
			x = Math.floor(space.width/2+space.x);
			y = Math.floor(space.height/2)+space.y;
			w = Math.floor(space.width/2);
			h = Math.floor(space.height/2);
			if (app.maximized_horizontally || app.maximizedVertically)
				app.unmaximize(Meta.MaximizeFlags.HORIZONTAL | Meta.MaximizeFlags.VERTICAL);
			app.move_resize_frame(true, x, y, w, h)
			break;
		case "maximize":
			if (!app.maximized_horizontally || !app.maximizedVertically)
				app.maximize(Meta.MaximizeFlags.HORIZONTAL | Meta.MaximizeFlags.VERTICAL);
			break;
		case "floating":
			if (app.maximized_horizontally || app.maximizedVertically)
				app.unmaximize(Meta.MaximizeFlags.HORIZONTAL | Meta.MaximizeFlags.VERTICAL);
			break;
	}
	let window = app.get_frame_rect()
	_log("window.x: "+window.x+" window.y: "+window.y+" window.width: "+window.width+" window.height: "+window.height)
}

function getMonitorArray() {
	var monitors = [];
	for (var i = 0; i < Main.layoutManager.monitors.length; i++) {
		monitors.push({ "index": i, "x": Main.layoutManager.monitors[i].x });
	}
	monitors.sort(function(a, b) {
		    return a.x - b.x;
	});
	for (var i = 0; i < monitors.length; i++) {
		_log(JSON.stringify(monitors[i]));
	}
	//var monitors = Main.layoutManager.monitors;
	//monitors.sort(function(a, b) {
	//});
	//let monWidth = Main.layoutManager.monitors[mon].width;
	//let monHeight = Main.layoutManager.monitors[mon].height;
	//_log("mon: " + mon);
}

function moveWindow(direction) {
	_log("moveWindow: " + direction);
	var app = global.display.focus_window;
	var space = app.get_work_area_current_monitor()
	let pos = getPosition(app, space);
	_log("pos: " + pos);
	//var monitors = getMonitorArray();
	var curMonitor = app.get_monitor();
	let monitorToLeft = -1;
	let monitorToRight = -1;
	for (var i = 0; i < Main.layoutManager.monitors.length; i++) {
		if (Main.layoutManager.monitors[i].x < Main.layoutManager.monitors[curMonitor].x && (monitorToLeft == -1 || (monitorToLeft >= 0 && Main.layoutManager.monitors[i].x > Main.layoutManager.monitors[monitorToLeft].x)))
			monitorToLeft = i;
		if (Main.layoutManager.monitors[i].x > Main.layoutManager.monitors[curMonitor].x && (monitorToRight == -1 || (monitorToRight >= 0 && Main.layoutManager.monitors[i].x < Main.layoutManager.monitors[monitorToRight].x)))
			monitorToRight = i;
	}
	_log("monitorToLeft: " + monitorToLeft);
	_log("monitorToRight " + monitorToRight);

	switch (direction) {
		case "left":
			if (pos == "left" && monitorToLeft != -1) {
				app.move_to_monitor(monitorToLeft);
				placeWindow("right", app);
			} else if (pos == "topleft" && monitorToLeft != -1) {
				app.move_to_monitor(monitorToLeft);
				placeWindow("topright", app);
			} else if (pos == "bottomleft" && monitorToLeft != -1) {
				app.move_to_monitor(monitorToLeft);
				placeWindow("bottomright", app);
			} else if (pos == "topright") {
				placeWindow("topleft", app);
			} else if (pos == "bottomright") {
				placeWindow("bottomleft", app);
			} else {
				placeWindow("left", app);
			}
			break;
		case "right":
			if (pos == "right" && monitorToRight != -1) {
				app.move_to_monitor(monitorToRight);
				placeWindow("left", app);
			} else if (pos == "topright" && monitorToRight != -1) {
				app.move_to_monitor(monitorToRight);
				placeWindow("topleft", app);
			} else if (pos == "bottomright" && monitorToRight != -1) {
				app.move_to_monitor(monitorToRight);
				placeWindow("bottomleft", app);
			} else if (pos == "topleft") {
				placeWindow("topright", app);
			} else if (pos == "bottomleft") {
				placeWindow("bottomright", app);
			} else {
				placeWindow("right", app);
			}
			break;
		case "up":
			if (pos == "left")
				placeWindow("topleft", app);
			else if (pos == "bottomleft")
				placeWindow("left", app);
			else if (pos == "right")
				placeWindow("topright", app);
			else if (pos == "bottomright")
				placeWindow("right", app);
			else
				placeWindow("maximize", app);
			break;
		case "down":
			if (pos == "left")
				placeWindow("bottomleft", app);
			else if (pos == "topleft")
				placeWindow("left", app);
			else if (pos == "right")
				placeWindow("bottomright", app);
			else if (pos == "topright")
				placeWindow("right", app);
			else if (pos == "maximized")
				placeWindow("floating", app);
			break;
	}
}

function requestMove(direction) {
	Mainloop.timeout_add(10, function () {
		moveWindow(direction);
	});
}

var enable = function() {
	let modifier = "<ctrl><super><shift>";
	let modifier2 = "<super>";
	let keyManager = new KeyManager()
	keyManager.listenFor(modifier+"left", function() { requestMove("left") })
	keyManager.listenFor(modifier+"right", function() { requestMove("right") })
	keyManager.listenFor(modifier+"up", function() { requestMove("up") })
	keyManager.listenFor(modifier+"down", function() { requestMove("down") })
	keyManager.listenFor(modifier2+"left", function() { requestMove("left") })
	keyManager.listenFor(modifier2+"right", function() { requestMove("right") })
	keyManager.listenFor(modifier2+"up", function() { requestMove("up") })
	keyManager.listenFor(modifier2+"down", function() { requestMove("down") })
}

