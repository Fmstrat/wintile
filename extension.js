const Meta = imports.gi.Meta
const Main = imports.ui.main
const Mainloop = imports.mainloop;
const Gio = imports.gi.Gio;

const ExtensionUtils = imports.misc.extensionUtils;
const Extension = ExtensionUtils.getCurrentExtension();

const ModalDialog = imports.ui.modalDialog;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;

const {Clutter, St} = imports.gi;

const Config = imports.misc.config;
const SHELL_VERSION_MAJOR = parseInt(Config.PACKAGE_VERSION.split('.')[0]);

let onWindowGrabBegin, onWindowGrabEnd;
let windowMoving = false;

// View logs with `journalctl -qf |grep WinTile`
var _log = function(str) {
	if (config.debug) {
		log('[WinTile]', str);
	}
}

let config = {
	cols: 2,
	useMaximize: true,
	useMinimize: true,
	debug: true,
	preview: {
		enabled: true,
		doubleWidth: true,
		distance: 75,
		delay: 500
	}
}

// Get the GSchema for our settings
let gschema = Gio.SettingsSchemaSource.new_from_directory(
	Extension.dir.get_child('schemas').get_path(),
	Gio.SettingsSchemaSource.get_default(),
	false
);

// Create a new settings object
let settings = new Gio.Settings({
	settings_schema: gschema.lookup('org.gnome.shell.extensions.wintile', true)
});

function updateSettings() {
	config.cols = (settings.get_value('cols').deep_unpack()) + 2;
	config.preview.doubleWidth = settings.get_value('double-width').deep_unpack();
	config.useMaximize = settings.get_value('use-maximize').deep_unpack();
	config.useMinimize = settings.get_value('use-minimize').deep_unpack();
	config.preview.enabled = settings.get_value('preview').deep_unpack();
	config.preview.distance = settings.get_value('distance').deep_unpack();
	config.preview.delay = settings.get_value('delay').deep_unpack();
	config.debug = settings.get_value('debug').deep_unpack();
	_log(JSON.stringify(config));
}

updateSettings();

// Watch the settings for changes
let settingsChangedId = settings.connect('changed', updateSettings.bind());

window.wintile = {
	extdatadir: imports.misc.extensionUtils.getCurrentExtension().path,
	shell_version: parseInt(Config.PACKAGE_VERSION.split('.')[1], 10)
};
imports.searchPath.unshift(wintile.extdatadir);

const KeyBindings = imports.keybindings
let keyManager = null;
var oldbindings = {
	unmaximize: [],
	maximize: [],
	toggle_tiled_left: [],
	toggle_tiled_right: []
}

// Minimize app if config allows
function requestMinimize(app) {
	_log("useMinimize: " + config.useMinimize);
	if (config.useMinimize) {
		_log("Minimize");
		app.minimize();
	} else {
		_log("Not minimizing due to config");
	}
}

// Move window to specified location and size.
// On paper, the move_resize_frame should not need the preceding move_frame, 
// but the additional move_frame is known to fix errors with gnome-terminal 
// and [gnome-]terminator.
// A similar fix is used in the gTile extension:
// See https://github.com/gTile/gTile/commit/fc68797015e13143f74606fcbb9d48859f55dca9 by jshack88.
function moveAppCoordinates(app, x, y, w, h) {
	_log("Moving window to (" + x + "," + y + "), size (" + w + "," + h + ")");
	app.move_frame(true, x, y);
	app.move_resize_frame(true, x, y, w, h);
}

function moveApp(app, loc) {
	_log("moveApp: " + JSON.stringify(loc));
	var space = null;
	if (loc.mouse) {
		var curMonitor = getCurrentMonitor();
		var monitor = Main.layoutManager.monitors[curMonitor];
		space = getActiveWorkspace().get_work_area_for_monitor(curMonitor);
	} else {
		space = app.get_work_area_current_monitor()
	}
	var colWidth = Math.floor(space.width / config.cols);
	var rowHeight = Math.floor(space.height / 2);

	let x = loc.col * colWidth + space.x;
	let y = loc.row * rowHeight + space.y;
	let w = loc.width * colWidth;
	let h = loc.height * rowHeight;

	if (!config.useMaximize) {
		unMaximizeIfMaximized(app);
		moveAppCoordinates(app, x, y, w, h);
	} else {
		if (loc.height < 2 || loc.width < config.cols) {
			unMaximizeIfMaximized(app);
		}
		moveAppCoordinates(app, x, y, w, h);
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
	_log("moveApp) window.x: " + window.x + " window.y: " + window.y + " window.width: " + window.width + " window.height: " + window.height)
}

function unMaximizeIfMaximized(app) {
	if (app.maximized_horizontally || app.maximized_vertically) {
		app.unmaximize(Meta.MaximizeFlags.BOTH);
	}
}

function initApp(app, maximized=false) {
	_log('initApp')
	if (!maximized) {
		_log('init as normal')
		app.wintile = {
			origFrame: app.get_frame_rect() || getDefaultFloatingRectangle(app),
			row: -1,
			col: -1,
			height: -1,
			width: -1
		};
	} else {
		_log('init as maximize')
		app.wintile = {
			origFrame: app.origFrameRect || getDefaultFloatingRectangle(app),
			row: 0,
			col: 0,
			height: 2,
			width: config.cols
		};
	}
}

function getDefaultFloatingRectangle(app) {
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

function restoreApp(app, move=true) {
	_log('restoreApp')
	_log(move)
	_log(JSON.stringify(app.wintile))
	if (app.maximized_horizontally || app.maximizedVertically) {
		app.unmaximize(Meta.MaximizeFlags.HORIZONTAL | Meta.MaximizeFlags.VERTICAL);
	}
	if (move) {
		var space = app.get_work_area_current_monitor();
		if (app.wintile.origFrame.x + app.wintile.origFrame.width > space.x + space.width) {
			app.wintile.origFrame.x = space.x + space.width - app.wintile.origFrame.width - 100;
		}
		if (app.wintile.origFrame.y + app.wintile.origFrame.height > space.y + space.height) {
			app.wintile.origFrame.y = space.y + space.height - app.wintile.origFrame.height - 100;
		}
		moveAppCoordinates(app, app.wintile.origFrame.x, app.wintile.origFrame.y, app.wintile.origFrame.width, app.wintile.origFrame.height);
	} else {
		// BUG: when clicking the maximize button, then dragging the window off, it moves to below the mouse cursor
		let [x, y, mask] = global.get_pointer();
		let window = app.get_frame_rect()
		_log(`A) mouse - x:${x} y:${y}`);
		_log(`A) window - x:${window.x} y:${window.y} w:${window.width} h:${window.height}`);
		window = app.wintile.origFrame;
		_log(`A) origFrame - x:${window.x} y:${window.y} w:${window.width} h:${window.height}`);
		moveAppCoordinates(app, Math.floor(x - app.wintile.origFrame.width / 2), y - 10, app.wintile.origFrame.width, app.wintile.origFrame.height);
		window = app.get_frame_rect()
		_log(`B) mouse - x:${x} y:${y}`);
		_log(`B) window - x:${window.x} y:${window.y} w:${window.width} h:${window.height}`);
		window = app.wintile.origFrame;
		_log(`B) origFrame - x:${window.x} y:${window.y} w:${window.width} h:${window.height}`);
	}
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
	// Calculate monitors height difference, to account for monitors different resolution 
	// If a monitor's Y is within 100px + height difference, it's beside it.
	for (var i = 0; i < Main.layoutManager.monitors.length; i++) {
		let monitorHeightDiff = Math.abs(Main.layoutManager.monitors[i].height - Main.layoutManager.monitors[curMonitor].height);
		_log("monitor " + i + " height : " + Main.layoutManager.monitors[i].height )
		_log("monitorsHeightDiff :" + monitorHeightDiff);

		if (Main.layoutManager.monitors[i].x < Main.layoutManager.monitors[curMonitor].x && 
			Math.abs(Main.layoutManager.monitors[i].y - Main.layoutManager.monitors[curMonitor].y) < (100 + monitorHeightDiff) &&
			 (monitorToLeft == -1 || (monitorToLeft >= 0 && Main.layoutManager.monitors[i].x > Main.layoutManager.monitors[monitorToLeft].x))) {
			monitorToLeft = i;
		}
		if (Main.layoutManager.monitors[i].x > Main.layoutManager.monitors[curMonitor].x && Math.abs(Main.layoutManager.monitors[i].y - Main.layoutManager.monitors[curMonitor].y) < (100 + monitorHeightDiff) &&
			(monitorToRight == -1 || (monitorToRight >= 0 && Main.layoutManager.monitors[i].x < Main.layoutManager.monitors[monitorToRight].x))) {
			monitorToRight = i;
		}
	}
	_log("monitorToLeft: " + monitorToLeft);
	_log("monitorToRight: " + monitorToRight);

	// First, check if maximized and apply a wintile state if so
	if (!app.wintile && app.maximized_horizontally && app.maximizedVertically) {
		initApp(app, true);
	}
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
					requestMinimize(app);
					break;
			}
		} else if (config.cols == 3) {
			// Ultrawide 3x2 grid
			switch (direction) {
				case "left":
					// Move to the left most column at full height
					initApp(app);
					moveApp(app, { "row": 0, "col": 0, "height": 2, "width": 1 });
					break;
				case "right":
					// Move to the right most column at full height
					initApp(app);
					moveApp(app, { "row": 0, "col": 2, "height": 2, "width": 1 });
					break;
				case "up":
					// 1st Maximize
					initApp(app);
					moveApp(app, { "row": 0, "col": 0, "height": 2, "width": 3 });
					break;
				case "down":
					// Minimize
					requestMinimize(app);
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
					requestMinimize(app);
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
						moveApp(app, { "row": app.wintile.row, "col": app.wintile.col - 1, "height": app.wintile.height, "width": app.wintile.width });
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
						moveApp(app, { "row": app.wintile.row, "col": 1, "height": 2, "width": 1 });
					} else if (app.wintile.col < 1) {
						// We can move right on this monitor and keep our size
						_log('right - 3')
						moveApp(app, { "row": app.wintile.row, "col": app.wintile.col + 1, "height": app.wintile.height, "width": app.wintile.width });
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
						requestMinimize(app);
					}
					break;
			}
		} else if (config.cols == 3) {
			// Ultrawide 3x2 grid
			switch (direction) {
				case "left":
					_log('left')
					if (app.wintile.col > 0) {
						// We can move left on this monitor and keep our size
						_log('left - 1')
						moveApp(app, { "row": app.wintile.row, "col": app.wintile.col - 1, "height": app.wintile.height, "width": app.wintile.width });
					} else if (app.wintile.col == 0 && app.wintile.width > 1) {
						// We are not yet to smallest width, so shrink
						_log('left - 2')
						moveApp(app, { "row": app.wintile.row, "col": 0, "height": app.wintile.height, "width": app.wintile.width - 1 });
					} else if (monitorToLeft != -1) {
						// There is a monitor to the left, so let's go there
						_log('left - 3')
						app.move_to_monitor(monitorToLeft);
						moveApp(app, { "row": app.wintile.row, "col": 2, "height": app.wintile.height, "width": 1 });
					} else {
						// We are already on the left, and there is no other monitor to the left
						// Move to the left most column at full height
						_log('left - 4')
						moveApp(app, { "row": 0, "col": 0, "height": 2, "width": 1 });
					}
					break;
				case "right":
					_log('right')
					if (app.wintile.col + app.wintile.width - 1 < 2) {
						// We can move right on this monitor and keep our size
						_log('right - 1')
						moveApp(app, { "row": app.wintile.row, "col": app.wintile.col + 1, "height": app.wintile.height, "width": app.wintile.width });
					} else if (app.wintile.col + app.wintile.width - 1 == 2 && app.wintile.width > 1) {
						// We are not yet to smallest width, so shrink
						_log('right - 2')
						moveApp(app, { "row": app.wintile.row, "col": app.wintile.col + 1, "height": app.wintile.height, "width": app.wintile.width - 1 });
					} else if (monitorToRight != -1) {
						// There is a monitor to the right, so let's go there
						_log('right - 3')
						app.move_to_monitor(monitorToRight);
						moveApp(app, { "row": app.wintile.row, "col": 0, "height": app.wintile.height, "width": 1 });
					} else {
						// We are already on the left, and there is no other monitor to the right
						// Move to the right most column at full height
						_log('right - 4')
						moveApp(app, { "row": 0, "col": 2, "height": 2, "width": 1 });
					}
					break;
				case "up":
					_log('up')
					if (app.wintile.height == 2) {
						// We are full height on half, go to top while keeping width
						_log('up - 1')
						moveApp(app, { "row": 0, "col": app.wintile.col, "height": 1, "width": app.wintile.width });
					} else if (app.wintile.row == 1) {
						// We are bottom half, go to full height, keeping width
						_log('up - 2')
						moveApp(app, { "row": 0, "col": app.wintile.col, "height": 2, "width": app.wintile.width });
					} else {
						// We are top half, go straight to 2nd maximize
						_log('up - 3')
						moveApp(app, { "row": 0, "col": 0, "height": 2, "width": 3 });
					}
					break;
				case "down":
					_log('down')
					if (app.wintile.col == 0 && app.wintile.width == 3 && app.wintile.height == 2) {
						// We are maximized, restore
						_log('down - 1')
						restoreApp(app);
					} else if (app.wintile.col == 0 && app.wintile.width == 3 && app.wintile.row == 0) {
						// We are top half, go to bottom half
						_log('down - 2')
						moveApp(app, { "row": 1, "col": 0, "height": app.wintile.height, "width": app.wintile.width });
					} else if (app.wintile.height == 2) {
						// We are full height, go to half height
						_log('down - 3')
						moveApp(app, { "row": 1, "col": app.wintile.col, "height": 1, "width": app.wintile.width });
					} else if (app.wintile.row == 0) {
						// We are top half, go to full height
						_log('down - 4')
						moveApp(app, { "row": 0, "col": app.wintile.col, "height": 2, "width": app.wintile.width });
					} else if (app.wintile.width != 3) {
						// We are not full bottom but are a tile, go full width
						_log('down - 5')
						moveApp(app, { "row": 1, "col": 0, "height": 1, "width": 3 });
					} else {
						// We are bottom half, minimize
						_log('down - 6')
						requestMinimize(app);
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
						moveApp(app, { "row": app.wintile.row, "col": app.wintile.col - 1, "height": app.wintile.height, "width": app.wintile.width });
					} else if (app.wintile.col == 0 && app.wintile.width > 1) {
						// We are not yet to smallest width, so shrink
						_log('left - 2')
						moveApp(app, { "row": app.wintile.row, "col": 0, "height": app.wintile.height, "width": app.wintile.width - 1 });
					} else if (monitorToLeft != -1) {
						// There is a monitor to the left, so let's go there
						_log('left - 3')
						app.move_to_monitor(monitorToLeft);
						moveApp(app, { "row": app.wintile.row, "col": 3, "height": app.wintile.height, "width": 1 });
					} else {
						// We are already on the left, and there is no other monitor to the left
						// Move to the left most column at full height
						_log('left - 4')
						moveApp(app, { "row": 0, "col": 0, "height": 2, "width": 1 });
					}
					break;
				case "right":
					_log('right')
					if (app.wintile.col + app.wintile.width - 1 < 3) {
						// We can move right on this monitor and keep our size
						_log('right - 1')
						moveApp(app, { "row": app.wintile.row, "col": app.wintile.col + 1, "height": app.wintile.height, "width": app.wintile.width });
					} else if (app.wintile.col + app.wintile.width - 1 == 3 && app.wintile.width > 1) {
						// We are not yet to smallest width, so shrink
						_log('right - 2')
						moveApp(app, { "row": app.wintile.row, "col": app.wintile.col + 1, "height": app.wintile.height, "width": app.wintile.width - 1 });
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
						_log('up - 1')
						moveApp(app, { "row": 0, "col": 0, "height": 2, "width": 4 });
					} else if (app.wintile.height == 2) {
						// We are full height on half, go to top while keeping width
						_log('up - 2')
						moveApp(app, { "row": 0, "col": app.wintile.col, "height": 1, "width": app.wintile.width });
					} else if (app.wintile.row == 1) {
						// We are bottom half, go to full height, keeping width
						_log('up - 3')
						moveApp(app, { "row": 0, "col": app.wintile.col, "height": 2, "width": app.wintile.width });
					} else {
						// We are top half, go straight to 2nd maximize
						_log('up - 4')
						moveApp(app, { "row": 0, "col": 0, "height": 2, "width": 4 });
					}
					break;
				case "down":
					_log('down')
					if (app.wintile.col == 0 && app.wintile.width == 4 && app.wintile.height == 2) {
						// We are 2nd maximized, go to 1st maximized
						_log('down - 1')
						moveApp(app, { "row": 0, "col": 1, "height": 2, "width": 2 });
					} else if (app.wintile.col == 0 && app.wintile.width == 4 && app.wintile.row == 0) {
						// We are top half, go to bottom half
						_log('down - 2')
						moveApp(app, { "row": 1, "col": 0, "height": app.wintile.height, "width": app.wintile.width });
					} else if (app.wintile.col == 1 && app.wintile.width == 2) {
						// We are 1st maximized, restore
						_log('down - 3')
						restoreApp(app);
					} else if (app.wintile.height == 2) {
						// We are full height, go to half height
						_log('down - 4')
						moveApp(app, { "row": 1, "col": app.wintile.col, "height": 1, "width": app.wintile.width });
					} else if (app.wintile.row == 0) {
						// We are top half, go to full height
						_log('down - 5')
						moveApp(app, { "row": 0, "col": app.wintile.col, "height": 2, "width": app.wintile.width });
					} else if (app.wintile.width != 4) {
						// We are not full bottom but are a tile, go full width
						_log('down - 6')
						moveApp(app, { "row": 1, "col": 0, "height": 1, "width": 4 });
					} else {
						// We are bottom half, minimize
						_log('down - 7')
						requestMinimize(app);
					}
					break;
			}
		}
	}
}

function requestMove(direction) {
	Mainloop.timeout_add(10, function() {
		sendMove(direction);
	});
}

function checkForMove(x, y, app) {
	_log('checkForMove')
	if (windowMoving) {
		Mainloop.timeout_add(10, function () {
			var curFrameAfter = app.get_frame_rect();
			let [xAfter, yAfter, mask] = global.get_pointer();
			if (x != xAfter || y != yAfter) {
				restoreApp(app, false);
			} else {
				checkForMove(x, y, app);
			}
		});
	}
}

function windowGrabBegin(meta_window, meta_grab_op) {
	_log('windowGrabBegin')
	let [x, y, mask] = global.get_pointer();
	var app = global.display.focus_window;
	let window = app.get_frame_rect()
	var leeway = 10;
	_log(`grabBegin) mouse - x:${x} y:${y}`);
	_log(`grabBegin) window - x:${window.x} y:${window.y} w:${window.width} h:${window.height}`);
	var output = '';
	if (y > window.y - leeway && y < window.y + leeway) {
		output += 'top ';
	}
	if (y > window.y + window.height - leeway && y < window.y + window.height + leeway) {
		output += 'bottom ';
	}
	if (x > window.x - leeway && x < window.x + leeway) {
		output += 'left ';
	}
	if (x > window.x + window.width - leeway && x < window.x + window.width + leeway) {
		output += 'right ';
	}
	if (output) {
		_log(`grabBegin) Mouse is on the ${output}side. Ignoring`);
		return;
	}
	if (meta_window && meta_grab_op !== Meta.GrabOp.WAYLAND_POPUP) {
		windowMoving = true;


		if (app.wintile) {
			let [x, y, mask] = global.get_pointer();
			let window = app.wintile.origFrame;
			_log(`grabBegin) origFrame - x:${window.x} y:${window.y} w:${window.width} h:${window.height}`);
			checkForMove(x, y, app);
		}
		if (meta_window.resizeable && config.preview.enabled) {
			app.origFrameRect = app.get_frame_rect();
			Mainloop.timeout_add(config.preview.delay, function () {
				checkIfNearGrid(app);
			});
		}
	}
}

function windowGrabEnd(meta_window, meta_grab_op) {
	_log('windowGrabEnd')
	if (meta_window && meta_grab_op !== Meta.GrabOp.WAYLAND_POPUP) {
		windowMoving = false;
		if (meta_window.resizeable && config.preview.enabled) {
			if (preview.visible == true) {
				var app = global.display.focus_window;
				if (!app.wintile) {
					initApp(app)
				}
				moveApp(app, { "row": preview.loc.row, "col": preview.loc.col, "height": preview.loc.height, "width": preview.loc.width, "mouse": true });
				hidePreview();
			} else {
				// If maximize button was pressed or double clicked on title bar, make the wintile var
				Mainloop.timeout_add(500, function () {
					var app = global.display.focus_window;
					if (app.maximized_horizontally && app.maximized_vertically) {
						initApp(app, true)
					}
				});
			}
		}
	}
}

function changeBinding(settings, key, oldBinding, newBinding) {
	var binding = oldbindings[key.replace(/-/g, '_')];
	var _newbindings = [];
	for (var i = 0; i < binding.length; i++) {
		let currentbinding = binding[i];
		if (currentbinding == oldBinding) {
			currentbinding = newBinding;
		}
		_newbindings.push(currentbinding)
	}
	settings.set_strv(key, _newbindings);
}

function isClose(a, b) {
	if (a <= b && a > b - config.preview.distance) {
		return true;
	}
	else if (a >= b && a < b + config.preview.distance) {
		return true;
	}
	else {
		return false;
	}
}

var preview = new St.BoxLayout({
	style_class: 'tile-preview',
	visible: false
});
Main.uiGroup.add_actor(preview);

function showPreview(loc, _x, _y, _w, _h) {
	if (preview.x !== _x && preview.y !== _y) {
		let [x, y, _] = global.get_pointer();
		preview.x = x;
		preview.y = y;
	}
	preview.visible = true;
	preview.loc = loc;
	preview.ease({
		time: 0.125,
		opacity: 255,
		visible: true,
		transition: Clutter.AnimationMode.EASE_OUT_QUAD,
		x: _x,
		y: _y,
		width: _w,
		height: _h
	});
}

function hidePreview() {
	preview.visible = false;
	preview.loc = null;
	preview.width = -1;
	preview.height = -1;
	preview.x = -1;
	preview.y = -1;
}

function checkIfNearGrid(app) {
	_log('checkIfNearGrid')
	if (windowMoving) {
		let [x, y, mask] = global.get_pointer();
		var close = false;
		var curMonitor = getCurrentMonitor();
		var monitor = Main.layoutManager.monitors[curMonitor];
		var space = getActiveWorkspace().get_work_area_for_monitor(curMonitor);
		var colWidth = Math.floor(space.width / config.cols);
		var rowHeight = Math.floor(space.height / 2);
		var inMonitorBounds = false;
		if (x >= monitor.x && x < monitor.x + monitor.width && y >= monitor.y && y < monitor.y + monitor.width) {
			inMonitorBounds = true;
		}
		let window = app.get_frame_rect()
		_log(`mouse - x:${x} y:${y}`);
		_log(`monitor - x:${monitor.x} y:${monitor.y} w:${monitor.width} h:${monitor.height} inB:${inMonitorBounds}`);
		_log(`space - x:${space.x} y:${space.y} w:${space.width} h:${space.height}`);
		_log(`window - x:${window.x} y:${window.y} w:${window.width} h:${window.height}`);
		for (var i = 0; i < config.cols; i++) {
			var grid_x = i * colWidth + space.x;
			if (inMonitorBounds && (isClose(y, space.y) || y < space.y) && x > Math.floor(space.width/2+space.x-colWidth/2) && x < Math.floor(space.width/2+space.x+colWidth/2)) {
				// If we are in the center top, show a preview for maximize
				showPreview({
					col: 0,
					row: 0,
					width: config.cols,
					height: 2
				}, space.x, space.y, space.width, space.height)
				close = true;
				break;
			} else if (inMonitorBounds && (isClose(x, space.x) || x < space.x) && y > Math.floor(space.height / 2 + space.y - rowHeight / 2) && y < Math.floor(space.height / 2 + space.y + rowHeight / 2)) {
				// If we are in the center left, show a preview for left maximize
				if (config.cols == 4 && config.preview.doubleWidth) {
					showPreview({
						col: 0,
						row: 0,
						width: 2,
						height: 2
					}, space.x, space.y, colWidth * 2, space.height)
				} else {
					showPreview({
						col: 0,
						row: 0,
						width: 1,
						height: 2
					}, space.x, space.y, colWidth, space.height)
				}
				close = true;
				break;
			} else if (inMonitorBounds && (isClose(x, space.x + space.width) || x > space.x + space.width) && y > Math.floor(space.height / 2 + space.y - rowHeight / 2) && y < Math.floor(space.height / 2 + space.y + rowHeight / 2)) {
				// If we are in the center right, show a preview for right maximize
				if (config.cols == 4 && config.preview.doubleWidth) {
					showPreview({
						col: config.cols - 2,
						row: 0,
						width: 2,
						height: 2
					}, space.x + space.width - colWidth * 2, space.y, colWidth * 2, space.height)
				} else {
					showPreview({
						col: config.cols - 1,
						row: 0,
						width: 1,
						height: 2
					}, space.x + space.width - colWidth, space.y, colWidth, space.height)
				}
				close = true;
				break;
			} else if (inMonitorBounds && (isClose(x, space.x) || x < space.x) && y > space.y && y < space.y + rowHeight) {
				// If we are close to the top left, show the top left grid item
				if (config.cols == 4 && config.preview.doubleWidth) {
					showPreview({
						col: 0,
						row: 0,
						width: 2,
						height: 1
					}, space.x, space.y, colWidth * 2, rowHeight)
				} else {
					showPreview({
						col: 0,
						row: 0,
						width: 1,
						height: 1
					}, space.x, space.y, colWidth, rowHeight)
				}
				close = true;
				break;
			} else if (inMonitorBounds && (isClose(x, space.x) || x < space.x) && y > space.y + rowHeight) {
				// If we are close to the bottom left, show the bottom left grid item
				if (config.cols == 4 && config.preview.doubleWidth) {
					showPreview({
						col: 0,
						row: 1,
						width: 2,
						height: 1
					}, space.x, space.y + rowHeight, colWidth * 2, rowHeight)
				} else {
					showPreview({
						col: 0,
						row: 1,
						width: 1,
						height: 1
					}, space.x, space.y + rowHeight, colWidth, rowHeight)
				}
				close = true;
				break;
			} else if (inMonitorBounds && (isClose(x, space.x + space.width) || x > space.x + space.width) && y > space.y && y < space.y + rowHeight) {
				// If we are close to the top right, show the top right grid item
				if (config.cols == 4 && config.preview.doubleWidth) {
					showPreview({
						col: config.cols - 2,
						row: 0,
						width: 2,
						height: 1
					}, space.x + space.width - colWidth * 2, space.y, colWidth * 2, rowHeight)
				} else {
					showPreview({
						col: config.cols - 1,
						row: 0,
						width: 1,
						height: 1
					}, space.x + space.width - colWidth, space.y, colWidth, rowHeight)
				}
				close = true;
				break;
			} else if (inMonitorBounds && (isClose(x, space.x + space.width) || x > space.x + space.width) && y > space.y + rowHeight) {
				// If we are close to the bottom right, show the bottom right grid item
				if (config.cols == 4 && config.preview.doubleWidth) {
					showPreview({
						col: config.cols - 2,
						row: 1,
						width: 2,
						height: 1
					}, space.x + space.width - colWidth * 2, space.y + rowHeight, colWidth * 2, rowHeight)
				} else {
					showPreview({
						col: config.cols - 1,
						row: 1,
						width: 1,
						height: 1
					}, space.x + space.width - colWidth, space.y + rowHeight, colWidth, rowHeight)
				}
				close = true;
				break;
			} else if (inMonitorBounds && (isClose(y, space.y) || y < space.y) && x > grid_x && x < grid_x + colWidth) {
				// If we are close to the top, show a preview for the top grid item
				showPreview({
					col: i,
					row: 0,
					width: 1,
					height: 1
				}, grid_x, space.y, colWidth, rowHeight)
				close = true;
				break;
			} else if (inMonitorBounds && (isClose(y, space.y + space.height) || y > space.y + space.height) && x > grid_x && x < grid_x + colWidth) {
				// If we are close to the bottom, show a preview for the bottom grid item
				showPreview({
					col: i,
					row: 1,
					width: 1,
					height: 1
				}, grid_x, space.y + rowHeight, colWidth, rowHeight)
				close = true;
				break;
			}
		}
		if (!close) {
			hidePreview();
		}
		Mainloop.timeout_add(config.preview.delay, function() {
			checkIfNearGrid(app);
		});
	}
}

function getActiveWorkspace() {
	if (global.screen) { // mutter < 3.29
		return global.screen.get_active_workspace()
	} else { // mutter >= 3.29
		let workspaceManager = global.workspace_manager;
		return workspaceManager.get_active_workspace();
	}
}

function getCurrentMonitor() {
	let monitorProvider = global.screen || global.display;
	return monitorProvider.get_current_monitor();
}

var enable = function() {
	_log('Enable')
	if (!keyManager) {
		_log('Keymanager is being defined')
		keyManager = new KeyBindings.Manager();
		let desktopSettings = new Gio.Settings({ schema_id: 'org.gnome.desktop.wm.keybindings' });
		let mutterKeybindingSettings = new Gio.Settings({ schema_id: 'org.gnome.mutter.keybindings' });
		let mutterSettings = new Gio.Settings({ schema_id: 'org.gnome.mutter' });
		try {
			let shellSettings = new Gio.Settings({ schema_id: 'org.gnome.shell.overrides' });
			shellSettings.set_boolean("edge-tiling", false);
		} catch (error) {
			_log("org.gnome.shell.overrides does not exist");
		}
		oldbindings['unmaximize'] = desktopSettings.get_strv('unmaximize');
		oldbindings['maximize'] = desktopSettings.get_strv('maximize');
		oldbindings['toggle_tiled_left'] = mutterKeybindingSettings.get_strv('toggle-tiled-left');
		oldbindings['toggle_tiled_right'] = mutterKeybindingSettings.get_strv('toggle-tiled-right');
		changeBinding(desktopSettings, 'unmaximize', '<Super>Down', '<Control><Shift><Super>Down');
		changeBinding(desktopSettings, 'maximize', '<Super>Up', '<Control><Shift><Super>Up');
		changeBinding(mutterKeybindingSettings, 'toggle-tiled-left', '<Super>Left', '<Control><Shift><Super>Left');
		changeBinding(mutterKeybindingSettings, 'toggle-tiled-right', '<Super>Right', '<Control><Shift><Super>Right');
		mutterSettings.set_boolean("edge-tiling", false);
		Mainloop.timeout_add(3000, function() {
			keyManager.add("<Super>left", function() {
				requestMove("left")
			})
			keyManager.add("<Super>right", function() {
				requestMove("right")
			})
			keyManager.add("<Super>up", function() {
				requestMove("up")
			})
			keyManager.add("<Super>down", function() {
				requestMove("down")
			})
		});

		// Since GNOME 40 the meta_display argument isn't passed anymore to these callbacks.
		// We "translate" the parameters here so that things work on both GNOME 3 and 40.
		onWindowGrabBegin = global.display.connect('grab-op-begin', (meta_display, meta_screen, meta_window, meta_grab_op, gpointer) => {
			if (SHELL_VERSION_MAJOR >= 40) {
				windowGrabBegin(meta_screen, meta_window);
			} else {
				windowGrabBegin(meta_window, meta_grab_op);
			}
		});
		onWindowGrabEnd = global.display.connect('grab-op-end', (meta_display, meta_screen, meta_window, meta_grab_op, gpointer) => {
			if (SHELL_VERSION_MAJOR >= 40) {
				windowGrabEnd(meta_screen, meta_window);
			} else {
				windowGrabEnd(meta_window, meta_grab_op);
			}
		});
	}
}

var disable = function() {
	_log('Disable')
	if (keyManager) {
		_log('Keymanager is being removed')
		keyManager.removeAll();
		keyManager.destroy();
		keyManager = null;
		let desktopSettings = new Gio.Settings({
			schema_id: 'org.gnome.desktop.wm.keybindings'
		});
		let shellSettings = new Gio.Settings({
			schema_id: 'org.gnome.shell.overrides'
		});
		let mutterKeybindingSettings = new Gio.Settings({
			schema_id: 'org.gnome.mutter.keybindings'
		});
		let mutterSettings = new Gio.Settings({
			schema_id: 'org.gnome.mutter'
		});
		desktopSettings.reset('unmaximize');
		desktopSettings.reset('maximize');
		mutterKeybindingSettings.reset('toggle-tiled-left');
		mutterKeybindingSettings.reset('toggle-tiled-right');
		mutterSettings.reset("edge-tiling")
		global.display.disconnect(onWindowGrabBegin);
		global.display.disconnect(onWindowGrabEnd);
	}
}
