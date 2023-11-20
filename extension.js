/* global global */

/* BEGIN NON-G45 */
const Meta = imports.gi.Meta;
const Main = imports.ui.main;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const ExtensionUtils = imports.misc.extensionUtils;
const Clutter = imports.gi.Clutter;
const St = imports.gi.St;
const Config = imports.misc.config;
const SHELL_VERSION = parseFloat(Config.PACKAGE_VERSION);
/* END NON-G45 */

/* BEGIN G45 */
// import Meta from 'gi://Meta';
// import * as Main from 'resource:///org/gnome/shell/ui/main.js';
// import Gio from 'gi://Gio';
// import GLib from 'gi://GLib';
// import Extension from 'resource:///org/gnome/shell/extensions/extension.js';
// import Clutter from 'gi://Clutter';
// import St from 'gi://St';
// import Config from imports.misc.config;
// const SHELL_VERSION = parseFloat(Config.PACKAGE_VERSION);
/* END G45 */

let onWindowGrabBegin, onWindowGrabEnd;
let requestMoveTimer, checkForMoveTimer, windowGrabBeginTimer, windowGrabEndTimer, checkIfNearGridTimer, keyManagerTimer;
let preview;
let windowMoving = false;
let dragStart = null;
let gsettings;


/* View logs with
journalctl -qf | grep -i -e Wintile -e 'js error'
*/

/**
 * @param {string} message - the actual log to be logged
 */
function _log(message) {
    if (config.debug)
        log('[WinTile]', message);
}

let config = {
    cols: 2,
    rows: 2,
    ultrawideOnly: false,
    nonUltraCols: 2,
    nonUltraRows: 2,
    useMaximize: true,
    useMinimize: true,
    preview: {
        enabled: true,
        doubleWidth: true,
        distance: 75,
        delay: 500,
    },
    gap: 0,
    debug: true,
};

/**
 *
 */
function updateSettings() {
    config.cols = gsettings.get_value('cols').deep_unpack();
    config.rows = gsettings.get_value('rows').deep_unpack();
    config.preview.doubleWidth = gsettings.get_value('double-width').deep_unpack();
    config.ultrawideOnly = gsettings.get_value('ultrawide-only').deep_unpack();
    config.nonUltraCols = gsettings.get_value('non-ultra-cols').deep_unpack();
    config.nonUltraRows = gsettings.get_value('non-ultra-rows').deep_unpack();
    config.useMaximize = gsettings.get_value('use-maximize').deep_unpack();
    config.useMinimize = gsettings.get_value('use-minimize').deep_unpack();
    config.preview.enabled = gsettings.get_value('preview').deep_unpack();
    config.preview.distance = gsettings.get_value('distance').deep_unpack();
    config.preview.delay = gsettings.get_value('delay').deep_unpack();
    config.gap = gsettings.get_value('gap').deep_unpack();
    config.debug = gsettings.get_value('debug').deep_unpack();
    _log(JSON.stringify(config));
}

const wintile = {
    extdatadir: imports.misc.extensionUtils.getCurrentExtension().path,
    shell_version: parseInt(Config.PACKAGE_VERSION.split('.')[1], 10),
};
imports.searchPath.unshift(wintile.extdatadir);

const KeyBindings = imports.keybindings;
let keyManager = null;
var oldbindings = {
    unmaximize: [],
    maximize: [],
    toggle_tiled_left: [],
    toggle_tiled_right: [],
};

// Minimize app if config allows
/**
 *
 * @param {object} app the window object
 */
function requestMinimize(app) {
    _log(`useMinimize: ${config.useMinimize}`);
    if (config.useMinimize) {
        _log('Minimize');
        app.minimize();
    } else {
        _log('Not minimizing due to config');
    }
}

// Move window to specified location and size.
// On paper, the move_resize_frame should not need the preceding move_frame,
// but the additional move_frame is known to fix errors with gnome-terminal
// and [gnome-]terminator.
// A similar fix is used in the gTile extension:
// See https://github.com/gTile/gTile/commit/fc68797015e13143f74606fcbb9d48859f55dca9 by jshack88.
/**
 *
 * @param {object} app - the window object
 * @param {number} x - desired x value
 * @param {number} y - desired y value
 * @param {number} w - desired width
 * @param {number} h - desired height
 */
function moveAppCoordinates(app, x, y, w, h) {
    if (config.gap) {
        const halfGap = Math.floor(config.gap / 2);
        w -= config.gap;
        h -= config.gap;
        x += halfGap;
        y += halfGap;
    }
    _log(`moveAppCoordinates) Moving window to (${x},${y}), size (${w},${h}) with ${config.gap}px gaps`);
    app.move_frame(true, x, y);
    app.move_resize_frame(true, x, y, w, h);
}

/**
 *
 * @param {object} app the window object
 * @param {object} loc = { col, row, width, height }
 */
function moveApp(app, loc) {
    _log(`moveApp) ${JSON.stringify(loc)}`);
    var monitor = null;
    var monitorIndex = null;
    if (loc.mouse)
        monitorIndex = getCurrentMonitor();
    else
        monitorIndex = app.get_monitor();

    monitor = getMonitorInfo(monitorIndex);

    _log(`moveApp) monitor: ${JSON.stringify(monitor)}`);

    var colCount = monitor.colCount;
    var rowCount = monitor.rowCount;

    // if the colCount >= than loc.col means that we're moving into a non-ultrawide monitor and it's near the right of the screen
    if (loc.col >= colCount)
        loc.col = colCount - 1;

    // if the rowCount >= than loc.row means that we're moving into a non-ultrawide monitor and it's near the bottom of the screen
    if (loc.row >= rowCount)
        loc.row = rowCount - 1;

    var colWidth = Math.floor(monitor.width / colCount);
    var rowHeight = Math.floor(monitor.height / rowCount);

    let x = loc.col * colWidth + monitor.x;
    let y = loc.row * rowHeight + monitor.y;
    let w = loc.width * colWidth;
    let h = loc.height * rowHeight;

    if (loc.col + loc.width === colCount)
        w += monitor.width % colCount;

    if (!config.useMaximize) {
        unMaximizeIfMaximized(app);
        moveAppCoordinates(app, x, y, w, h);
    } else {
        if (loc.height < rowCount || loc.width < colCount)
            unMaximizeIfMaximized(app);

        moveAppCoordinates(app, x, y, w, h);
        if (loc.height === rowCount && loc.width === colCount) {
            // Maximize
            _log('moveApp) maximize');
            app.maximize(Meta.MaximizeFlags.HORIZONTAL | Meta.MaximizeFlags.VERTICAL);
        } else if (loc.height === rowCount && !config.gap) {
            // Maximize vertically
            _log('moveApp) maximize - v');
            app.maximize(Meta.MaximizeFlags.VERTICAL);
        } else if (loc.width === colCount && !config.gap) {
            // Maximize horizontally
            _log('moveApp) maximize - h');
            app.maximize(Meta.MaximizeFlags.HORIZONTAL);
        }
    }

    app.wintile.col = loc.col;
    app.wintile.row = loc.row;
    app.wintile.width = loc.width;
    app.wintile.height = loc.height;
    let window = app.get_frame_rect();
    let leftShift = window.width - w + config.gap;
    let upShift = window.height - h + config.gap;
    if (leftShift && loc.col === colCount - 1) {
        _log(`moveApp) window wider than anticipated. Shift left by ${leftShift} px`);
        x -= leftShift;
        w = window.width;
    }
    if (upShift && loc.row === rowCount - 1) {
        _log(`moveApp) window lower than anticipated. Shift up by ${upShift} px`);
        y -= upShift;
        h = window.height;
    }
    if (upShift || leftShift)
        moveAppCoordinates(app, x, y, w, h);

    _log(`moveApp) window.x: ${window.x} window.y: ${window.y} window.width: ${window.width} window.height: ${window.height}`);
}

/**
 *
 * @param {object} app - The window object
 */
function unMaximizeIfMaximized(app) {
    if (app.maximized_horizontally || app.maximized_vertically)
        app.unmaximize(Meta.MaximizeFlags.BOTH);
}

/**
 *
 * @param {object} app - The window object
 * @param {boolean} maximized - Treat as already maximized
 */
function initApp(app, maximized = false) {
    const coords = app.get_frame_rect() || getDefaultFloatingRectangle(app);
    if (!maximized) {
        _log('initApp) init as normal');
        app.wintile = {
            origFrame: {'x': coords.x, 'y': coords.y, 'width': coords.width, 'height': coords.height},
            row: -1,
            col: -1,
            height: -1,
            width: -1,
        };
    } else {
        _log('initApp) init as maximize');
        app.wintile = {
            origFrame: {'x': coords.x, 'y': coords.y, 'width': coords.width, 'height': coords.height},
            row: 0,
            col: 0,
            height: config.rows,
            width: config.cols,
        };
    }
    _log(`initApp) app.wintile: ${JSON.stringify(app.wintile)}`);
}

/**
 *
 * @param {object} app the window object
 */
function getDefaultFloatingRectangle(app) {
    _log('getDefaultFloatingRectangle) Getting default rectangle.');
    let padding = 100;
    let workspace = app.get_work_area_current_monitor();
    return {
        x: workspace.x + padding,
        y: workspace.y + padding,
        width: workspace.width - padding * 2,
        height: workspace.height - padding * 2,
    };
}

/**
 *
 * @param {object} app the window object
 * @param {boolean} move -
 */
function restoreApp(app, move = true) {
    _log(`restoreApp) move: ${move}`);
    _log(`restoreApp) app.wintile: ${JSON.stringify(app.wintile)}`);
    unMaximizeIfMaximized(app);

    const [mouseX, mouseY] = global.get_pointer();
    if (move) {
        var space = app.get_work_area_current_monitor();
        if (app.wintile.origFrame.x + app.wintile.origFrame.width > space.x + space.width)
            app.wintile.origFrame.x = space.x + space.width - app.wintile.origFrame.width - 100;

        if (app.wintile.origFrame.y + app.wintile.origFrame.height > space.y + space.height)
            app.wintile.origFrame.y = space.y + space.height - app.wintile.origFrame.height - 100;

        moveAppCoordinates(app, app.wintile.origFrame.x, app.wintile.origFrame.y, app.wintile.origFrame.width, app.wintile.origFrame.height);
    } else {
        // BUG: when clicking the maximize button, then dragging the window off, it moves to below the mouse cursor
        let window = app.get_frame_rect();
        _log(`restoreApp A) mouse - mouseX:${mouseX} mouseY:${mouseY}`);
        _log(`restoreApp A) window - x:${window.x} y:${window.y} w:${window.width} h:${window.height}`);
        window = app.wintile.origFrame;
        _log(`restoreApp A) origFrame - x:${window.x} y:${window.y} w:${window.width} h:${window.height}`);
        moveAppCoordinates(app, Math.floor(mouseX - app.wintile.origFrame.width / 2), mouseY - 10, app.wintile.origFrame.width, app.wintile.origFrame.height);
        window = app.get_frame_rect();
        _log(`restoreApp B) mouse - mouseX:${mouseX} mouseY:${mouseY}`);
        _log(`restoreApp B) window - x:${window.x} y:${window.y} w:${window.width} h:${window.height}`);
        window = app.wintile.origFrame;
        _log(`restoreApp B) origFrame - x:${window.x} y:${window.y} w:${window.width} h:${window.height}`);
    }
    app.wintile = null;
}

/**
 *
 * @param {string} direction - must be left, right, up, or down
 * @param {boolean} ctrlPressed - self explanatory
 */
function sendMove(direction, ctrlPressed = false) {
    _log('---');
    _log(`sendMove) ${direction} ctrl: ${ctrlPressed}`);
    var app = global.display.focus_window;
    var monitorIndex = app.get_monitor();
    var curMonitor = getMonitorInfo(monitorIndex);

    let monitorToLeft = -1;
    let monitorToRight = -1;
    _log(`sendMove) curMonitor: ${JSON.stringify(curMonitor)}`);
    for (var i = 0; i < Main.layoutManager.monitors.length; i++) {
        if (i === monitorIndex)
            continue;

        let testMonitor = getMonitorInfo(i);
        let monitorHeightDiff = Math.abs(testMonitor.height - curMonitor.height);
        _log(`sendMove) testMonitor: ${JSON.stringify(testMonitor)}`);
        _log(`sendMove) monitorsHeightDiff :${monitorHeightDiff}`);

        if (testMonitor.x < curMonitor.x &&
            Math.abs(testMonitor.y - curMonitor.y) < (100 + monitorHeightDiff) &&
            (monitorToLeft === -1 || (monitorToLeft >= 0 && testMonitor.x > Main.layoutManager.monitors[monitorToLeft].x)))
            monitorToLeft = i;

        if (testMonitor.x > curMonitor.x && Math.abs(testMonitor.y - curMonitor.y) < (100 + monitorHeightDiff) &&
            (monitorToRight === -1 || (monitorToRight >= 0 && testMonitor.x < Main.layoutManager.monitors[monitorToRight].x)))
            monitorToRight = i;
    }
    _log(`sendMove) monitorToLeft: ${monitorToLeft} monitorToRight: ${monitorToRight}`);

    // First, check if maximized and apply a wintile state if so
    if (!app.wintile && app.maximized_horizontally && app.maximized_vertically)
        initApp(app, true);

    var colCount = curMonitor.colCount;
    var rowCount = curMonitor.rowCount;

    if (!app.wintile) {
        // We are not in a tile. Reset and find the most logical position
        _log('sendMove) Not in tile.');
        if (colCount === 4 || colCount === 5) {
            // 4 col grid
            switch (direction) {
            case 'left':
                // Move to the left half at full height
                initApp(app);
                moveApp(app, {'row': 0, 'col': 0, 'height': rowCount, 'width': 2});
                break;
            case 'right':
                // Move to the right half at full height
                initApp(app);
                moveApp(app, {'row': 0, 'col': colCount - 2, 'height': rowCount, 'width': 2});
                break;
            case 'up':
                // Maximize to center leaving 1 column on either side
                initApp(app);
                moveApp(app, {'row': 0, 'col': 1, 'height': rowCount, 'width': colCount - 2});
                break;
            case 'down':
                // Minimize
                requestMinimize(app);
                break;
            }
        } else {
            switch (direction) {
            case 'left':
                // Move to the far left at full height
                initApp(app);
                moveApp(app, {'row': 0, 'col': 0, 'height': rowCount, 'width': 1});
                break;
            case 'right':
                // Move to the far right at full height
                initApp(app);
                moveApp(app, {'row': 0, 'col': colCount - 1, 'height': rowCount, 'width': 1});
                break;
            case 'up':
                // Maximize
                initApp(app);
                moveApp(app, {'row': 0, 'col': 0, 'height': rowCount, 'width': colCount});
                break;
            case 'down':
                // Minimize
                requestMinimize(app);
                break;
            }
        }
    } else {
        // We are already in a tile.
        _log('sendMove) Already in a tile.');
        _log(`sendMove) ${JSON.stringify(app.wintile)}`);
        if (app.wintile.width > colCount) {
            _log(`sendMove) columns higher than expected. Lowering to ${colCount}`);
            app.wintile.width = colCount;
        }
        if (app.wintile.height > rowCount) {
            _log(`sendMove) rows higher than expected. Lowering to ${rowCount}`);
            app.wintile.height = rowCount;
        }

        if (ctrlPressed) {
            // any amount of columns
            switch (direction) {
            case 'left':
                if (app.wintile.col > 0) {
                    _log('sendMove) left - grow');
                    moveApp(app, {'row': app.wintile.row, 'col': app.wintile.col - 1, 'height': app.wintile.height, 'width': app.wintile.width + 1});
                } else {
                    _log('sendMove) left - can\'t grow');
                }
                break;
            case 'right':
                if (app.wintile.col + app.wintile.width < colCount) {
                    _log('sendMove) right - grow');
                    moveApp(app, {'row': app.wintile.row, 'col': app.wintile.col, 'height': app.wintile.height, 'width': app.wintile.width + 1});
                } else {
                    _log('sendMove) right - can\'t grow');
                }
                break;
            case 'up':
                if (app.wintile.row > 0) {
                    _log('sendMove) up - grow');
                    moveApp(app, {'row': app.wintile.row - 1, 'col': app.wintile.col, 'height': app.wintile.height + 1, 'width': app.wintile.width});
                } else {
                    _log('sendMove) up - can\'t grow');
                }
                break;
            case 'down':
                if (app.wintile.row + app.wintile.height < rowCount) {
                    _log('sendMove) down - grow');
                    moveApp(app, {'row': app.wintile.row, 'col': app.wintile.col, 'height': app.wintile.height + 1, 'width': app.wintile.width});
                } else {
                    _log('sendMove) down - can\'t grow');
                }
                break;
            }
        } else {
            // any col grid
            switch (direction) {
            case 'left':
                _log('sendMove) left');
                if (app.wintile.col > 0) {
                    if (ctrlPressed) {
                        // We can grow left
                        _log('sendMove) left - grow');
                        moveApp(app, {'row': app.wintile.row, 'col': app.wintile.col - 1, 'height': app.wintile.height, 'width': app.wintile.width + 1});
                    } else {
                        // We can move left on this monitor and keep our size
                        _log('sendMove) left - move');
                        moveApp(app, {'row': app.wintile.row, 'col': app.wintile.col - 1, 'height': app.wintile.height, 'width': app.wintile.width});
                    }
                } else if (app.wintile.col === 0 && app.wintile.width > 1) {
                    // We are not yet to smallest width, so shrink
                    _log('sendMove) left - shrink');
                    moveApp(app, {'row': app.wintile.row, 'col': 0, 'height': app.wintile.height, 'width': app.wintile.width - 1});
                } else if (monitorToLeft !== -1) {
                    // There is a monitor to the left, so let's go there
                    _log('sendMove) left - yes monitor');
                    let newMonitor = getMonitorInfo(monitorToLeft);
                    app.move_to_monitor(monitorToLeft);
                    if (app.wintile.height === rowCount)
                        moveApp(app, {'row': app.wintile.row, 'col': newMonitor.colCount - 1, 'height': newMonitor.rowCount, 'width': 1});
                    else
                        moveApp(app, {'row': app.wintile.row, 'col': newMonitor.colCount - 1, 'height': app.wintile.height, 'width': 1});
                } else {
                    // We are already on the left, and there is no other monitor to the left
                    // Move to the left most column at full height
                    _log('sendMove) left - full-height');
                    moveApp(app, {'row': 0, 'col': 0, 'height': rowCount, 'width': 1});
                }
                break;
            case 'right':
                _log('sendMove) right');
                if (app.wintile.col + app.wintile.width - 1 < colCount - 1) {
                    // We can move right on this monitor and keep our size
                    _log('sendMove) right - move');
                    moveApp(app, {'row': app.wintile.row, 'col': app.wintile.col + 1, 'height': app.wintile.height, 'width': app.wintile.width});
                } else if (app.wintile.col + app.wintile.width - 1 === colCount - 1 && app.wintile.width > 1) {
                    // We are not yet to smallest width, so shrink
                    _log('sendMove) right - shrink');
                    moveApp(app, {'row': app.wintile.row, 'col': app.wintile.col + 1, 'height': app.wintile.height, 'width': app.wintile.width - 1});
                } else if (monitorToRight !== -1) {
                    // There is a monitor to the right, so let's go there
                    _log('sendMove) right - yes monitor');
                    let newMonitor = getMonitorInfo(monitorToRight);
                    app.move_to_monitor(monitorToRight);
                    if (app.wintile.height === rowCount)
                        moveApp(app, {'row': app.wintile.row, 'col': 0, 'height': newMonitor.rowCount, 'width': 1});
                    else
                        moveApp(app, {'row': app.wintile.row, 'col': 0, 'height': app.wintile.height, 'width': 1});
                } else {
                    // We are already on the right, and there is no other monitor to the right
                    // Move to the right most column at full height
                    _log('sendMove) right - full-height');
                    moveApp(app, {'row': 0, 'col': colCount - 1, 'height': rowCount, 'width': 1});
                }
                break;
            case 'up':
                _log('sendMove) up');
                if (app.wintile.row > 0) {
                    // We can move up on this monitor and keep our size
                    _log('sendMove) up - move');
                    moveApp(app, {'row': app.wintile.row - 1, 'col': app.wintile.col, 'height': app.wintile.height, 'width': app.wintile.width});
                } else if ((colCount === 4 || colCount === 5) && app.wintile.height === rowCount && app.wintile.width === colCount - 2 && app.wintile.col === 1) {
                    // We are in 1st maximize, go to full maximize
                    _log('sendMove) up - 1st max to full max');
                    moveApp(app, {'row': 0, 'col': 0, 'height': rowCount, 'width': colCount});
                } else if (app.wintile.row === 0 && app.wintile.height > 1) {
                    // We are already on the top, shrink
                    _log('sendMove) up - shrink');
                    moveApp(app, {'row': app.wintile.row, 'col': app.wintile.col, 'height': app.wintile.height - 1, 'width': app.wintile.width});
                } else if (app.wintile.row === rowCount - 1) {
                    // We are bottom row, go to full height, keeping width
                    _log('sendMove) up - bottom up');
                    moveApp(app, {'row': 0, 'col': app.wintile.col, 'height': rowCount, 'width': app.wintile.width});
                } else {
                    // We are top row, go straight to 2nd maximize
                    _log('sendMove) up - top up');
                    moveApp(app, {'row': 0, 'col': 0, 'height': rowCount, 'width': colCount});
                }
                break;
            case 'down':
                _log('sendMove) down');
                if (app.wintile.col === 0 && app.wintile.width === colCount && app.wintile.height === rowCount) {
                    if (colCount === 4 || colCount === 5) {
                        // We are 2nd maximized, go to 1st maximized
                        _log('sendMove) down - 2nd max to 1st max');
                        moveApp(app, {'row': 0, 'col': 1, 'height': rowCount, 'width': colCount - 2});
                    } else {
                        // We are maximized, restore
                        _log('sendMove) down - restore');
                        restoreApp(app);
                    }
                } else if ((colCount === 4 || colCount === 5) && app.wintile.col === 1 && app.wintile.width === colCount - 2) {
                    // We are 1st maximized, restore
                    _log('sendMove) down - 1st max to restore');
                    restoreApp(app);
                } else if (app.wintile.row + app.wintile.height < rowCount) {
                    // We can move down on this monitor and keep our size
                    _log('sendMove) down - move');
                    moveApp(app, {'row': app.wintile.row + 1, 'col': app.wintile.col, 'height': app.wintile.height, 'width': app.wintile.width});
                } else if (app.wintile.row + app.wintile.height === rowCount && app.wintile.height > 1) {
                    // We are already at the bottom, shrink
                    _log('sendMove) down - shrink');
                    moveApp(app, {'row': app.wintile.row + 1, 'col': app.wintile.col, 'height': app.wintile.height - 1, 'width': app.wintile.width});
                } else if (app.wintile.row === rowCount - 1 && app.wintile.width !== colCount) {
                    // We are not full bottom but are a tile, go full width
                    _log('sendMove) down - full-width');
                    moveApp(app, {'row': app.wintile.row, 'col': 0, 'height': 1, 'width': colCount});
                } else {
                    // We are bottom half, minimize
                    _log('sendMove) down - try minimize');
                    requestMinimize(app);
                }
                break;
            }
        }
    }
}

/**
 *
 * @param {string} direction - must be left, right, up, or down
 * @param {boolean} ctrlPressed - self explanatory
 */
function requestMove(direction, ctrlPressed = false) {
    requestMoveTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 10, () => {
        sendMove(direction, ctrlPressed);
    });
}

/**
 *
 * @param {number} x - desired x value
 * @param {number} y - desired y value
 * @param {object} app - the window object
 */
function checkForMove(x, y, app) {
    _log(`checkForMove) x: ${x}, y: ${y}`);
    if (!windowMoving)
        return;
    checkForMoveTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 10, () => {
        let [xAfter, yAfter] = global.get_pointer();
        if (x !== xAfter || y !== yAfter)
            restoreApp(app, false);
        else
            checkForMove(x, y, app);
    });
}

/**
 *
 * @param {object} mask - the mouse event mask from metaGrabOp
 *
 */
function isResize(mask) {
    let resizes = [Meta.GrabOp.RESIZING_NW,
        Meta.GrabOp.RESIZING_N,
        Meta.GrabOp.RESIZING_NE,
        Meta.GrabOp.RESIZING_E,
        Meta.GrabOp.RESIZING_SW,
        Meta.GrabOp.RESIZING_S,
        Meta.GrabOp.RESIZING_SE,
        Meta.GrabOp.RESIZING_W];

    const resize = resizes.some(value => mask === value);
    _log(`isResize) mask: ${mask} resize: ${resize}`);
    return resize;
}


/**
 *
 * @param {object} metaWindow - window object
 * @param {object} metaGrabOp - type of window being grabbed
 */
function windowGrabBegin(metaWindow, metaGrabOp) {
    let [mouseX, mouseY] = global.get_pointer();
    if (isResize(metaGrabOp))
        return false;

    var app = global.display.focus_window;
    let window = app.get_frame_rect();
    _log(`windowGrabBegin) mouse - mouseX:${mouseX} mouseY:${mouseY}`);
    _log(`windowGrabBegin) window - x:${window.x} y:${window.y} w:${window.width} h:${window.height}`);

    if (metaWindow && metaGrabOp !== Meta.GrabOp.WAYLAND_POPUP) {
        windowMoving = true;

        if (app.wintile) {
            window = app.wintile.origFrame;
            _log(`windowGrabBegin) origFrame - x:${window.x} y:${window.y} w:${window.width} h:${window.height}`);
            checkForMove(mouseX, mouseY, app);
        }
        if (metaWindow.resizeable && config.preview.enabled) {
            app.origFrameRect = app.get_frame_rect();
            windowGrabBeginTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, config.preview.delay, () => {
                checkIfNearGrid(app);
            });
        }
    }
}

/**
 *
 * @param {object} metaWindow - the window object
 * @param {object} metaGrabOp - another window object
 */
function windowGrabEnd(metaWindow, metaGrabOp) {
    _log('windowGrabEnd)');
    if (metaWindow && metaGrabOp !== Meta.GrabOp.WAYLAND_POPUP) {
        windowMoving = false;
        if (metaWindow.resizeable && config.preview.enabled) {
            if (preview.visible) {
                const app = global.display.focus_window;
                if (!app.wintile)
                    initApp(app);

                moveApp(app, {
                    row: preview.loc.row,
                    col: preview.loc.col,
                    height: preview.loc.height,
                    width: preview.loc.width,
                    mouse: true,
                });

                hidePreview();
            } else {
                windowGrabEndTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
                    const app = global.display.focus_window;
                    if (app.maximized_horizontally && app.maximized_vertically)
                        initApp(app, true);
                });
            }
        }
    }
    dragStart = null;
}

/**
 *
 * @param {object} settingsObject - Keybinding object
 * @param {string} key - Name of key being changed. E.g. maximize, unmaximize, toggle-tiled-left, toggle-tiled-right
 * @param {string} oldBinding - What the binding was
 * @param {string} newBinding - What the new binding will be
 */
function changeBinding(settingsObject, key, oldBinding, newBinding) {
    var binding = oldbindings[key.replace(/-/g, '_')];
    var _newbindings = [];
    for (var i = 0; i < binding.length; i++) {
        let currentbinding = binding[i];
        if (currentbinding === oldBinding)
            currentbinding = newBinding;

        _newbindings.push(currentbinding);
    }
    settingsObject.set_strv(key, _newbindings);
}

/**
 *
 * @param {number} a - first number
 * @param {number} b - second number
 * @param {number} distance - how far apart can numbers be?
 */
function isClose(a, b, distance = config.preview.distance) {
    return Math.abs(a - b) < distance;
}

/**
 *
 * @param {object} loc = { col, row, width, height }
 * @param {number} spaceX - starting x of the screen
 * @param {number} spaceY - starting y of the screen
 * @param {number} colWidth - single col width
 * @param {number} rowHeight - single row height
 */
function showPreview(loc, spaceX, spaceY, colWidth, rowHeight) {
    if (preview.loc && JSON.stringify(preview.loc) === JSON.stringify(loc))
        return;

    let [mouseX, mouseY] = global.get_pointer();
    preview.x = mouseX;
    preview.y = mouseY;
    preview.visible = true;
    preview.loc = loc;
    preview.ease({
        time: 0.125,
        opacity: 255,
        visible: true,
        transition: Clutter.AnimationMode.EASE_OUT_QUAD,
        x: spaceX + (colWidth * loc.col) + Math.floor(config.gap / 2),
        y: spaceY + (rowHeight * loc.row) + Math.floor(config.gap / 2),
        width: colWidth * loc.width - config.gap,
        height: rowHeight * loc.height - config.gap,
    });
}

/**
 *
 */
function hidePreview() {
    preview.visible = false;
    preview.loc = null;
    preview.width = -1;
    preview.height = -1;
    preview.x = -1;
    preview.y = -1;
}

/**
 *
 * @param {object} app the window object
 */
function checkIfNearGrid(app) {
    _log('checkIfNearGrid)');
    if (!windowMoving)
        return;

    let [mouseX, mouseY, mask] = global.get_pointer();
    let ctrlPressed = mask & Clutter.ModifierType.CONTROL_MASK;
    let superPressed = mask & Clutter.ModifierType.MOD4_MASK; // windows key
    var close = false;

    var monitorIndex = getCurrentMonitor();
    var monitor = getMonitorInfo(monitorIndex);
    _log(`checkIfNearGrid) monitor: ${JSON.stringify(monitor)}`);

    var colCount = monitor.colCount;
    var rowCount = monitor.rowCount;

    var colWidth = Math.floor(monitor.width / colCount);
    var rowHeight = Math.floor(monitor.height / rowCount);

    let window = app.get_frame_rect();
    _log(`checkIfNearGrid) mouse - mouseX:${mouseX} mouseY:${mouseY} mask:${mask}`);
    _log(`checkIfNearGrid) keys - ctrl:${ctrlPressed} superPressed:${superPressed}`);
    _log(`checkIfNearGrid) monitor - x:${monitor.x} y:${monitor.y} w:${monitor.width} h:${monitor.height}`);
    _log(`checkIfNearGrid) window - x:${window.x} y:${window.y} w:${window.width} h:${window.height}`);
    var c = Math.floor((mouseX - monitor.x) / colWidth);
    var r = Math.floor((mouseY - monitor.y) / rowHeight);
    c = Math.max(0, Math.min(c, colCount - 1));
    r = Math.max(0, Math.min(r, rowCount - 1));

    var gridX = c * colWidth + monitor.x;
    var inGrid = mouseX > gridX && mouseX < gridX + colWidth;
    var centerOfGrid = mouseX > Math.floor(gridX + colWidth / 3) && mouseX < Math.floor(gridX + (2 * colWidth / 3));
    var topRow = mouseY < monitor.y + rowHeight;
    var bottomRow = mouseY > monitor.y + monitor.height - rowHeight;
    var nearTop = isClose(mouseY, monitor.y) || mouseY < monitor.y;
    var nearBottom = isClose(mouseY, monitor.y + monitor.height) || mouseY > monitor.y + monitor.height;
    var nearLeft = isClose(mouseX, monitor.x) || mouseX < monitor.x;
    var nearRight = isClose(mouseX, monitor.rightEdge) || mouseX > monitor.rightEdge;

    var centerOfScreenH = monitor.x + Math.floor(monitor.width / 2);
    var columnWidthFraction = Math.floor(colWidth / 3);
    var nearCenterH = mouseX > centerOfScreenH - (columnWidthFraction / 2) && mouseX < centerOfScreenH + (columnWidthFraction / 2);

    var centerOfScreenV = monitor.y + Math.floor(monitor.height / 2);
    var rowHeightFraction = Math.floor(rowHeight / 3);
    var nearCenterV = mouseY > centerOfScreenV - (rowHeightFraction / 2) && mouseY < centerOfScreenV + (rowHeightFraction / 2);

    if (ctrlPressed && superPressed && dragStart === null) {
        dragStart = {col: c, row: r, monitorIndex};
        _log(`checkIfNearGrid) dragStart: ${JSON.stringify(dragStart)}`);
    }

    if (ctrlPressed && superPressed) {
        // check if it's on the samescreen it was on before, otherwise reinitialize dragStart
        if (dragStart.monitorIndex !== monitorIndex)
            dragStart = {col: c, row: r, monitor};
        // If ctrl and super are pressed, draw the box from start to finish
        showPreview({
            col: Math.min(c, dragStart.col),
            row: Math.min(r, dragStart.row),
            width: Math.abs(c - dragStart.col) + 1,
            height: Math.abs(r - dragStart.row) + 1,
        }, monitor.x, monitor.y, colWidth, rowHeight);
        close = true;
    } else if (nearTop && nearCenterH) {
        // If we are in the center top, show a preview for maximize
        showPreview({
            col: 0,
            row: 0,
            width: colCount,
            height: rowCount,
        }, monitor.x, monitor.y, colWidth, rowHeight);
        close = true;
    } else if (nearBottom && nearCenterH) {
        // If we are in the center bottom, show a preview for bottom maximized horizontally
        showPreview({
            col: 0,
            row: rowCount - 1,
            width: colCount,
            height: 1,
        }, monitor.x, monitor.y, colWidth, rowHeight);
        close = true;
    } else if (nearLeft && nearCenterV) {
        // If we are in the center left, show a preview for left maximize
        if ((colCount === 4 || colCount === 5) && config.preview.doubleWidth) {
            showPreview({
                col: 0,
                row: 0,
                width: 2,
                height: rowCount,
            }, monitor.x, monitor.y, colWidth, rowHeight);
        } else {
            showPreview({
                col: 0,
                row: 0,
                width: 1,
                height: rowCount,
            }, monitor.x, monitor.y, colWidth, rowHeight);
        }
        close = true;
    } else if (nearRight && nearCenterV) {
        // If we are in the center right, show a preview for right maximize
        if ((colCount === 4 || colCount === 5) && config.preview.doubleWidth) {
            showPreview({
                col: colCount - 2,
                row: 0,
                width: 2,
                height: rowCount,
            }, monitor.x, monitor.y, colWidth, rowHeight);
        } else {
            showPreview({
                col: colCount - 1,
                row: 0,
                width: 1,
                height: rowCount,
            }, monitor.x, monitor.y, colWidth, rowHeight);
        }
        close = true;
    } else if (nearLeft && topRow) {
        // If we are close to the top left, show the top left grid item
        if ((colCount === 4 || colCount === 5) && config.preview.doubleWidth) {
            showPreview({
                col: 0,
                row: 0,
                width: 2,
                height: 1,
            }, monitor.x, monitor.y, colWidth, rowHeight);
        } else {
            showPreview({
                col: 0,
                row: 0,
                width: 1,
                height: 1,
            }, monitor.x, monitor.y, colWidth, rowHeight);
        }
        close = true;
    } else if (nearLeft && bottomRow) {
        // If we are close to the bottom left, show the bottom left grid item
        if ((colCount === 4 || colCount === 5) && config.preview.doubleWidth) {
            showPreview({
                col: 0,
                row: rowCount - 1,
                width: 2,
                height: 1,
            }, monitor.x, monitor.y, colWidth, rowHeight);
        } else {
            showPreview({
                col: 0,
                row: rowCount - 1,
                width: 1,
                height: 1,
            }, monitor.x, monitor.y, colWidth, rowHeight);
        }
        close = true;
    } else if (nearRight && topRow) {
        // If we are close to the top right, show the top right grid item
        if ((colCount === 4 || colCount === 5) && config.preview.doubleWidth) {
            showPreview({
                col: colCount - 2,
                row: 0,
                width: 2,
                height: 1,
            }, monitor.x, monitor.y, colWidth, rowHeight);
        } else {
            showPreview({
                col: colCount - 1,
                row: 0,
                width: 1,
                height: 1,
            }, monitor.x, monitor.y, colWidth, rowHeight);
        }
        close = true;
    } else if (nearRight && bottomRow) {
        // If we are close to the bottom right, show the bottom right grid item
        if ((colCount === 4 || colCount === 5) && config.preview.doubleWidth) {
            showPreview({
                col: colCount - 2,
                row: rowCount - 1,
                width: 2,
                height: 1,
            }, monitor.x, monitor.y, colWidth, rowHeight);
            close = true;
        } else if (ctrlPressed || nearLeft || nearRight) {
            // If we are close to the left or right or ctrl pressed, show the preview, wherever the pointer is
            showPreview({
                col: colCount - 1,
                row: rowCount - 1,
                width: 1,
                height: 1,
            }, monitor.x, monitor.y, colWidth, rowHeight);
        }
        close = true;
    } else if (nearTop && inGrid) {
        // If we are close to the top, show a preview for the top grid item
        showPreview({
            col: c,
            row: 0,
            width: 1,
            height: 1,
        }, monitor.x, monitor.y, colWidth, rowHeight);
        close = true;
    } else if (nearBottom && centerOfGrid) {
        // If we are close to the bottom and in the middle of a grid, show a preview for the bottom grid item at full height
        showPreview({
            col: c,
            row: 0,
            width: 1,
            height: rowCount,
        }, monitor.x, monitor.y, colWidth, rowHeight);
        close = true;
    } else if (nearBottom && inGrid) {
        // If we are close to the bottom, show a preview for the bottom grid item
        showPreview({
            col: c,
            row: rowCount - 1,
            width: 1,
            height: 1,
        }, monitor.x, monitor.y, colWidth, rowHeight);
        close = true;
    } else if (ctrlPressed || nearLeft || nearRight) {
        // If we are close to the left or right or ctrl pressed, show the preview, wherever the pointer is
        showPreview({
            col: c,
            row: r,
            width: 1,
            height: 1,
        }, monitor.x, monitor.y, colWidth, rowHeight);
        close = true;
    }

    if (!close)
        hidePreview();

    checkIfNearGridTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, config.preview.delay, () => {
        checkIfNearGrid(app);
    });
}

/**
 *
 */
function getActiveWorkspace() {
    if (global.screen) { // mutter < 3.29
        return global.screen.get_active_workspace();
    } else { // mutter >= 3.29
        let workspaceManager = global.workspace_manager;
        return workspaceManager.get_active_workspace();
    }
}

/**
 *
 */
function getCurrentMonitor() {
    let monitorProvider = global.screen || global.display;
    return monitorProvider.get_current_monitor();
}

/**
 * @param {int} monitorIndex self explanatory
 */
function getMonitorInfo(monitorIndex) {
    let space = getActiveWorkspace().get_work_area_for_monitor(monitorIndex);
    let isPortrait = space.width < space.height;
    let isNotUltrawide = (space.height / space.width) < 1.9 && (space.width / space.height) < 1.9;
    var colCount = config.ultrawideOnly && isNotUltrawide ? config.nonUltraCols : config.cols;
    var rowCount = config.ultrawideOnly && isNotUltrawide ? config.nonUltraRows : config.rows;

    // swap col and row in portrait mode
    if (isPortrait)
        [colCount, rowCount] = [rowCount, colCount];

    let monitor = {
        monitorIndex,
        x: space.x,
        y: space.y,
        width: space.width,
        height: space.height,
        leftEdge: space.x,
        rightEdge: space.x + space.width,
        topEdge: space.y,
        bottomEdge: space.y + space.height,
        isPortrait,
        isNotUltrawide,
        colCount,
        rowCount,
    };
    return monitor;
}

/**
 *
 */
class WintileExtension {
    enable() {
        _log('enable) Keymanager is being defined');
        keyManager = new KeyBindings.Manager();
        let desktopSettings = new Gio.Settings({schema_id: 'org.gnome.desktop.wm.keybindings'});
        let mutterKeybindingSettings = new Gio.Settings({schema_id: 'org.gnome.mutter.keybindings'});
        let mutterSettings = new Gio.Settings({schema_id: 'org.gnome.mutter'});
        try {
            let shellSettings = new Gio.Settings({schema_id: 'org.gnome.shell.overrides'});
            shellSettings.set_boolean('edge-tiling', false);
        } catch (error) {
            _log('enable) org.gnome.shell.overrides does not exist');
        }
        oldbindings['unmaximize'] = desktopSettings.get_strv('unmaximize');
        oldbindings['maximize'] = desktopSettings.get_strv('maximize');
        oldbindings['toggle_tiled_left'] = mutterKeybindingSettings.get_strv('toggle-tiled-left');
        oldbindings['toggle_tiled_right'] = mutterKeybindingSettings.get_strv('toggle-tiled-right');
        changeBinding(desktopSettings, 'unmaximize', '<Super>Down', '<Control><Shift><Super>Down');
        changeBinding(desktopSettings, 'maximize', '<Super>Up', '<Control><Shift><Super>Up');
        changeBinding(mutterKeybindingSettings, 'toggle-tiled-left', '<Super>Left', '<Control><Shift><Super>Left');
        changeBinding(mutterKeybindingSettings, 'toggle-tiled-right', '<Super>Right', '<Control><Shift><Super>Right');
        mutterSettings.set_boolean('edge-tiling', false);
        keyManagerTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 3000, () => {
            keyManager.add('<Super><Control>left', () => {
                requestMove('left', true);
            });
            keyManager.add('<Super><Control>right', () => {
                requestMove('right', true);
            });
            keyManager.add('<Super><Control>up', () => {
                requestMove('up', true);
            });
            keyManager.add('<Super><Control>down', () => {
                requestMove('down', true);
            });
            keyManager.add('<Super>left', () => {
                requestMove('left');
            });
            keyManager.add('<Super>right', () => {
                requestMove('right');
            });
            keyManager.add('<Super>up', () => {
                requestMove('up');
            });
            keyManager.add('<Super>down', () => {
                requestMove('down');
            });
        });

        // Since GNOME 40 the metaDisplay argument isn't passed anymore to these callbacks.
        // We "translate" the parameters here so that things work on both GNOME 3 and 40.
        onWindowGrabBegin = global.display.connect('grab-op-begin', (metaDisplay, metaScreen, metaWindow, metaGrabOp, _gpointer) => {
            if (SHELL_VERSION >= 40)
                windowGrabBegin(metaScreen, metaWindow);
            else
                windowGrabBegin(metaWindow, metaGrabOp);
        });
        onWindowGrabEnd = global.display.connect('grab-op-end', (metaDisplay, metaScreen, metaWindow, metaGrabOp, _gpointer) => {
            if (SHELL_VERSION >= 40)
                windowGrabEnd(metaScreen, metaWindow);
            else
                windowGrabEnd(metaWindow, metaGrabOp);
        });

        // Create a new gsettings object
        preview = new St.BoxLayout({
            style_class: 'tile-preview',
            visible: false,
        });
        Main.uiGroup.add_actor(preview);

        gsettings = ExtensionUtils.getSettings();
        updateSettings();

        // Watch the gsettings for changes
        gsettings.connect('changed', updateSettings.bind());
    }

    /**
     *
     */
    disable() {
        _log('disable) Keymanager is being removed');
        keyManager.removeAll();
        keyManager.destroy();
        keyManager = null;
        let desktopSettings = new Gio.Settings({schema_id: 'org.gnome.desktop.wm.keybindings'});
        let mutterKeybindingSettings = new Gio.Settings({schema_id: 'org.gnome.mutter.keybindings'});
        let mutterSettings = new Gio.Settings({schema_id: 'org.gnome.mutter'});
        try {
            let shellSettings = new Gio.Settings({schema_id: 'org.gnome.shell.overrides'});
            shellSettings.reset('edge-tiling');
        } catch (error) {
            _log('disable) org.gnome.shell.overrides does not exist');
        }
        desktopSettings.reset('unmaximize');
        desktopSettings.reset('maximize');
        desktopSettings = null;
        mutterKeybindingSettings.reset('toggle-tiled-left');
        mutterKeybindingSettings.reset('toggle-tiled-right');
        mutterKeybindingSettings = null;
        mutterSettings.reset('edge-tiling');
        mutterSettings = null;
        global.display.disconnect(onWindowGrabBegin);
        global.display.disconnect(onWindowGrabEnd);
        onWindowGrabBegin = null;
        onWindowGrabEnd = null;
        GLib.source_remove(requestMoveTimer);
        GLib.source_remove(checkForMoveTimer);
        GLib.source_remove(windowGrabBeginTimer);
        GLib.source_remove(windowGrabEndTimer);
        GLib.source_remove(checkIfNearGridTimer);
        GLib.source_remove(keyManagerTimer);
        gsettings = null;
        preview = null;
        dragStart = null;
    }
}

/**
 *
 * @param {object} _meta = standard meta object
 */
function init(_meta) {
    return new WintileExtension();
}
