const Meta = imports.gi.Meta
const Main = imports.ui.main
const Mainloop = imports.mainloop;
const Gio = imports.gi.Gio;

let config = {
	cols: 2,
	useMaximize: true,
	debug: true
}

let _close = 50;

// View logs with `journalctl -qf |grep WinTile`
var _log = function(str) {
	if (config.debug) {
		log('[WinTile]', str);
	}
}

const Config = imports.misc.config;
window.gsconnect = {
	    extdatadir: imports.misc.extensionUtils.getCurrentExtension().path,
	    shell_version: parseInt(Config.PACKAGE_VERSION.split('.')[1], 10)
};
imports.searchPath.unshift(gsconnect.extdatadir);

const KeyBindings = imports.keybindings
let keyManager = null;
var oldbindings = {
	unmaximize: [],
	maximize: [],
	toggle_tiled_left: [],
	toggle_tiled_right: []
}

function moveApp(app, loc) {
	_log("moveApp: " + JSON.stringify(loc));
	var space = app.get_work_area_current_monitor()
	colWidth = Math.floor(space.width/config.cols)
	rowHeight = Math.floor(space.height/2)

	let x = loc.col * colWidth + space.x;
	let y = loc.row * rowHeight + space.y;
	let w = loc.width * colWidth;
	let h = loc.height * rowHeight;

	if (!config.useMaximize) {
		unMaximizeIfMaximized(app);
		app.move_resize_frame(true, x, y, w, h);
	} else {
		if (loc.height < 2 || loc.width < config.cols) {
			unMaximizeIfMaximized(app);
		}
		app.move_resize_frame(true, x, y, w, h);
		if (loc.height == 2 && loc.width == config.cols) {
			// Maximize
			_log('maximize')
			app.maximize(Meta.MaximizeFlags.HORIZONTAL | Meta.MaximizeFlags.VERTICAL);
		} else if (loc.height == 2) {
			// Maximize vertically
			_log('maximize - v')
			app.maximize(Meta.MaximizeFlags.VERTICAL);
		} else if (loc.width == config.cols) {
			// Maximize horizontally
			_log('maximize - h')
			app.maximize(Meta.MaximizeFlags.HORIZONTAL);
		}
	}

	app.wintile.col = loc.col;
	app.wintile.row = loc.row;
	app.wintile.width = loc.width;
	app.wintile.height = loc.height;

	let window = app.get_frame_rect()
	_log("window.x: "+window.x+" window.y: "+window.y+" window.width: "+window.width+" window.height: "+window.height)
}

function unMaximizeIfMaximized(app) {
	if (app.maximized_horizontally || app.maximized_vertically) {
		app.unmaximize(Meta.MaximizeFlags.BOTH);
	}
}

function initApp(app) {
	app.wintile = {
		origFrame: app.get_frame_rect() || getDefaultFloatingRectangle(),
		row: -1,
		col: -1,
		height: -1,
		width: -1
	};
}

function getDefaultFloatingRectangle() {
	_log('Getting default rectangle.')
	let padding = 100;
	let workspace = app.get_work_area_current_monitor();
    return {
        x: workspace.x + padding,
        y: workspace.y + padding,
        width: workspace.width - padding * 2,
        height: workspace.height - padding * 2
    };
}

function restoreApp(app) {
	if (app.maximized_horizontally || app.maximizedVertically)
		app.unmaximize(Meta.MaximizeFlags.HORIZONTAL | Meta.MaximizeFlags.VERTICAL);
	app.move_resize_frame(true, app.wintile.origFrame.x, app.wintile.origFrame.y, app.wintile.origFrame.width, app.wintile.origFrame.height);
	app.wintile = null;
}

function sendMove(direction) {
	_log("---");
	_log("sendMove: " + direction);
	var app = global.display.focus_window;
	var space = app.get_work_area_current_monitor()
	var curMonitor = app.get_monitor();
	let monitorToLeft = -1;
	let monitorToRight = -1;
	// If a monitor's Y is within 100px, it's beside it.
	for (var i = 0; i < Main.layoutManager.monitors.length; i++) {
		if (Main.layoutManager.monitors[i].x < Main.layoutManager.monitors[curMonitor].x && Math.abs(Main.layoutManager.monitors[i].y - Main.layoutManager.monitors[curMonitor].y) < 100 && (monitorToLeft == -1 || (monitorToLeft >= 0 && Main.layoutManager.monitors[i].x > Main.layoutManager.monitors[monitorToLeft].x)))
			monitorToLeft = i;
		if (Main.layoutManager.monitors[i].x > Main.layoutManager.monitors[curMonitor].x && Math.abs(Main.layoutManager.monitors[i].y - Main.layoutManager.monitors[curMonitor].y) < 100 && (monitorToRight == -1 || (monitorToRight >= 0 && Main.layoutManager.monitors[i].x < Main.layoutManager.monitors[monitorToRight].x)))
			monitorToRight = i;
	}
	_log("monitorToLeft: " + monitorToLeft);
	_log("monitorToRight: " + monitorToRight);

	if (!app.wintile) {
		// We are not in a tile. Reset and find the most logical position
		_log('Not in tile.')
		if (config.cols == 2) {
			// Normal 2x2 grid
			switch (direction) {
				case "left":
					// Move to the left most column at full height
					initApp(app);
					moveApp(app, { "row": 0, "col": 0, "height": 2, "width": 1 });
					break;
				case "right":
					// Move to the right most column at full height
					initApp(app);
					moveApp(app, { "row": 0, "col": 1, "height": 2, "width": 1 });
					break;
				case "up":
					// 1st Maximize
					initApp(app);
					moveApp(app, { "row": 0, "col": 0, "height": 2, "width": 2 });
					break;
				case "down":
					// Minimize
					app.minimize();
					break;
			}	
		} else {
			// Ultrawide 4x2 grid
			switch (direction) {
				case "left":
					// Move to the left half at full height
					initApp(app);
					moveApp(app, { "row": 0, "col": 0, "height": 2, "width": 2 });
					break;
				case "right":
					// Move to the right half at full height
					initApp(app);
					moveApp(app, { "row": 0, "col": 2, "height": 2, "width": 2 });
					break;
				case "up":
					// Maximize to center 4
					initApp(app);
					moveApp(app, { "row": 0, "col": 1, "height": 2, "width": 2 });
					break;
				case "down":
					// Minimize
					initApp(app);
					app.minimize();
					break;
			}	
		}
	} else {
		// We are already in a tile.
		_log('Already in a tile.')
		_log(JSON.stringify(app.wintile));
		if (config.cols == 2) {
			// Normal 2x2 grid
			switch (direction) {
				case "left":
					_log('left')
					if (app.wintile.col > 0) {
						// We can move left on this monitor and keep our size
						_log('left - 1')
						moveApp(app, { "row": app.wintile.row, "col": app.wintile.col-1, "height": app.wintile.height, "width": app.wintile.width });
					} else if (app.wintile.width == 2) {
						// We are full width top or bottom, shrink
						_log('left - 2')
						moveApp(app, { "row": app.wintile.row, "col": 0, "height": app.wintile.height, "width": 1 });
					} else if (monitorToLeft == -1) {
						// We are already on the left, and there is no other monitor to the left
						// Move to the left most column at full height
						_log('left - 3')
						moveApp(app, { "row": 0, "col": 0, "height": 2, "width": 1 });
					} else {
						// There is a monitor to the left, so let's go there
						app.move_to_monitor(monitorToLeft);
						_log('left - 4')
						moveApp(app, { "row": app.wintile.row, "col": 1, "height": app.wintile.height, "width": app.wintile.width });
					}
					break;
				case "right":
					_log('right')
					if (app.wintile.col == 0 && app.wintile.width == 2 && app.wintile.height == 2) {
						// We are maximized, move to right
						_log('right - 1')
						moveApp(app, { "row": 0, "col": 1, "height": 2, "width": 1 });
					} else if (app.wintile.col == 0 && app.wintile.width == 2) {
						// We are a top or bottom half, shrink
						_log('right - 2')
						moveApp(app, { "row": app.wintile.row, "col": 1, "height": app.wintile.height, "width": 1 });
					} else if (app.wintile.col < 1) {
						// We can move right on this monitor and keep our size
						_log('right - 3')
						moveApp(app, { "row": app.wintile.row, "col": app.wintile.col+1, "height": app.wintile.height, "width": app.wintile.width });
					} else if (monitorToRight == -1) {
						// We are already on the right, and there is no other monitor to the right
						// Move to the right most column at full height
						_log('right - 4')
						moveApp(app, { "row": 0, "col": 1, "height": 2, "width": 1 });
					} else {
						// There is a monitor to the right, so let's go there
						app.move_to_monitor(monitorToRight);
						_log('right - 5')
						moveApp(app, { "row": app.wintile.row, "col": 0, "height": app.wintile.height, "width": app.wintile.width });
					}
					break;
				case "up":
					_log('up')
					if (app.wintile.height == 2 && app.wintile.width == 1) {
						// We are full height and not maximized, go to half height
						_log('up - 1')
						moveApp(app, { "row": app.wintile.row, "col": app.wintile.col, "height": 1, "width": 1 });
					} else if (app.wintile.row == 1) {
						// We are bottom half, go to full height
						_log('up - 2')
						moveApp(app, { "row": 0, "col": app.wintile.col, "height": 2, "width": app.wintile.width });
					} else if (app.wintile.height == 2 && app.wintile.width == 2) {
						// We are maximized, go to top half
						_log('up - 3');
						moveApp(app, { "row": app.wintile.row, "col": app.wintile.col, "height": 1, "width": app.wintile.width });
					} else {
						// We are top half, maximize
						_log('up - 4')
						moveApp(app, { "row": 0, "col": 0, "height": 2, "width": 2 });
					}
					break;
				case "down":
					_log('down')
					if (app.wintile.col == 0 && app.wintile.width == 2 && app.wintile.height == 2) {
						// We are maximized, restore
						_log('down - 1')
						restoreApp(app);
					} else if (app.wintile.col == 0 && app.wintile.width == 2 && app.wintile.row == 0) {
						// We are top half, go to bottom half
						_log('down - 2')
						moveApp(app, { "row": 1, "col": app.wintile.col, "height": app.wintile.height, "width": app.wintile.width });
					} else if (app.wintile.height == 2) {
						// We are full height, go to half height
						_log('down - 3')
						moveApp(app, { "row": 1, "col": app.wintile.col, "height": 1, "width": 1 });
					} else if (app.wintile.row == 0) {
						// We are top half, go to full height
						_log('down - 4')
						moveApp(app, { "row": 0, "col": app.wintile.col, "height": 2, "width": 1 });
					} else if (app.wintile.row == 1 && app.wintile.width == 1) {
						// We are a bottom tile, go full width
						_log('down - 5')
						moveApp(app, { "row": app.wintile.row, "col": 0, "height": app.wintile.height, "width": 2 });
					} else {
						// We are bottom half, minimize
						_log('down - 6')
						app.minimize();
					}
					break;
			}	
		} else {
			// Ultrawide 4x2 grid
			switch (direction) {
				case "left":
					_log('left')
					if (app.wintile.col > 0) {
						// We can move left on this monitor and keep our size
						_log('left - 1')
						moveApp(app, { "row": app.wintile.row, "col": app.wintile.col-1, "height": app.wintile.height, "width": app.wintile.width });
					} else if (app.wintile.col == 0 && app.wintile.width > 1) {
						// We are not yet to smallest width, so shrink
						_log('left - 2')
						moveApp(app, { "row": app.wintile.row, "col": 0, "height": app.wintile.height, "width": app.wintile.width-1 });
					} else if (monitorToLeft != -1) {
						// There is a monitor to the left, so let's go there
						_log('left - 3')
						app.move_to_monitor(monitorToLeft);
						moveApp(app, { "row": app.wintile.row, "col": 4, "height": app.wintile.height, "width": 1 });
					} else {
						// We are already on the left, and there is no other monitor to the left
						// Move to the left most column at full height
						_log('left - 4')
						moveApp(app, { "row": 0, "col": 0, "height": 2, "width": 1 });
					}
					break;
				case "right":
					_log('right')
					if (app.wintile.col+app.wintile.width-1 < 3) {
						// We can move right on this monitor and keep our size
						_log('right - 1')
						moveApp(app, { "row": app.wintile.row, "col": app.wintile.col+1, "height": app.wintile.height, "width": app.wintile.width });
					} else if (app.wintile.col+app.wintile.width-1 == 3 && app.wintile.width > 1) {
						// We are not yet to smallest width, so shrink
						_log('right - 2')
						moveApp(app, { "row": app.wintile.row, "col": app.wintile.col+1, "height": app.wintile.height, "width": app.wintile.width-1 });
					} else if (monitorToRight != -1) {
						// There is a monitor to the right, so let's go there
						_log('right - 3')
						app.move_to_monitor(monitorToRight);
						moveApp(app, { "row": app.wintile.row, "col": 0, "height": app.wintile.height, "width": 1 });
					} else {
						// We are already on the left, and there is no other monitor to the right
						// Move to the right most column at full height
						_log('right - 4')
						moveApp(app, { "row": 0, "col": 3, "height": 2, "width": 1 });
					}
					break;
				case "up":
					_log('up')
					if (app.wintile.height == 2 && app.wintile.width == 2 && app.wintile.col == 1) {
						// We are in 1st maximize, go to full maximize
						// This is different from 2x2
						_log('up - 1')
						moveApp(app, { "row": 0, "col": 0, "height": 2, "width": 4 });
					} else if (app.wintile.height == 2) {
						// We are full height on half, go to top while keeping width
						// This changed from 2x2
						_log('up - 2')
						moveApp(app, { "row": 0, "col": app.wintile.col, "height": 1, "width": app.wintile.width });
					} else if (app.wintile.row == 1) {
						// We are bottom half, go to full height, keeping width
						// This changed from 2x2
						_log('up - 3')
						moveApp(app, { "row": 0, "col": app.wintile.col, "height": 2, "width": app.wintile.width });
					} else {
						// We are top half, go straight to 2nd maximize
						// This changed from 2x2
						_log('up - 4')
						moveApp(app, { "row": 0, "col": 0, "height": 2, "width": 4 });
					}
					break;
				case "down":
					_log('down')
					if (app.wintile.col == 0 && app.wintile.width == 4 && app.wintile.height == 2) {
						// We are 2nd maximized, go to 1st maximized
						// This is different from 2x2
						_log('down - 1')
						moveApp(app, { "row": 0, "col": 1, "height": 2, "width": 2 });
					} else if (app.wintile.col == 0 && app.wintile.width == 4 && app.wintile.row == 0) {
						// We are top half, go to bottom half
						// This is different from 2x2
						_log('down - 2')
						moveApp(app, { "row": 1, "col": 0, "height": app.wintile.height, "width": app.wintile.width });
					} else if (app.wintile.col == 1 && app.wintile.width == 2) {
						// We are 1st maximized, restore
						// This changed from 2x2
						_log('down - 3')
						restoreApp(app);
					} else if (app.wintile.height == 2) {
						// We are full height, go to half height
						// This changed from 2x3
						_log('down - 4')
						moveApp(app, { "row": 1, "col": app.wintile.col, "height": 1, "width": app.wintile.width });
					} else if (app.wintile.row == 0) {
						// We are top half, go to full height
						// This changed from 2x2
						_log('down - 5')
						moveApp(app, { "row": 0, "col": app.wintile.col, "height": 2, "width": app.wintile.width });
					} else if (app.wintile.width != 4) {
						// We are not full bottom but are a tile, go full width
						_log('down - 6')
						moveApp(app, { "row": 1, "col": 0, "height": 1, "width": 4 });					
					} else {
						// We are bottom half, minimize
						_log('down - 7')
						app.minimize();
					}
					break;
			}	
		}
	}
}

function requestMove(direction) {
	Mainloop.timeout_add(10, function () {
		sendMove(direction);
	});
}

function changeBinding(settings, key, oldBinding, newBinding) {
	var binding = oldbindings[key.replace(/-/g, '_')];
	var _newbindings = [];
	for (var i = 0; i < binding.length; i++) {
		let currentbinding = binding[i];
		if (currentbinding == oldBinding)
			currentbinding = newBinding;
		_newbindings.push(currentbinding)
	}
	settings.set_strv(key, _newbindings);
}

function resetBinding(settings, key) {
	var binding = oldbindings[key.replace(/-/g, '_')];
	settings.set_strv(key, binding);
}

var enable = function() {
	if (!keyManager) {
		keyManager = new KeyBindings.Manager();
		let desktopSettings = new Gio.Settings({ schema_id: 'org.gnome.desktop.wm.keybindings' });
		let mutterSettings = new Gio.Settings({ schema_id: 'org.gnome.mutter.keybindings' });
		oldbindings['unmaximize'] = desktopSettings.get_strv('unmaximize');
		oldbindings['maximize'] = desktopSettings.get_strv('maximize');
		oldbindings['toggle_tiled_left'] = mutterSettings.get_strv('toggle-tiled-left');
		oldbindings['toggle_tiled_right'] = mutterSettings.get_strv('toggle-tiled-right');
		changeBinding(desktopSettings, 'unmaximize', '<Super>Down', '<Control><Shift><Super>Down');
		changeBinding(desktopSettings, 'maximize', '<Super>Up', '<Control><Shift><Super>Up');
		changeBinding(mutterSettings, 'toggle-tiled-left', '<Super>Left', '<Control><Shift><Super>Left');
		changeBinding(mutterSettings, 'toggle-tiled-right', '<Super>Right', '<Control><Shift><Super>Right');
		Mainloop.timeout_add(3000, function() {
			keyManager.add("<Super>left", function() { requestMove("left") })
			keyManager.add("<Super>right", function() { requestMove("right") })
			keyManager.add("<Super>up", function() { requestMove("up") })
			keyManager.add("<Super>down", function() { requestMove("down") })
		});
	}
}

var disable = function() {
	if (keyManager) {
		keyManager.removeAll();
		keyManager.destroy();
		keyManager = null;
		let desktopSettings = new Gio.Settings({ schema_id: 'org.gnome.desktop.wm.keybindings' });
		let mutterSettings = new Gio.Settings({ schema_id: 'org.gnome.mutter.keybindings' });
		resetBinding(desktopSettings, 'unmaximize');
		resetBinding(desktopSettings, 'maximize');
		resetBinding(mutterSettings, 'toggle-tiled-left');
		resetBinding(mutterSettings, 'toggle-tiled-right');
	}
}
