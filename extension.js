/* global global */
const Meta = imports.gi.Meta;
const Main = imports.ui.main;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;

const ExtensionUtils = imports.misc.extensionUtils;

const {Clutter, St} = imports.gi;

const Config = imports.misc.config;
const SHELL_VERSION = parseFloat(Config.PACKAGE_VERSION);

let onWindowGrabBegin, onWindowGrabEnd;
let requestMoveTimer, checkForMoveTimer, windowGrabBeginTimer, windowGrabEndTimer, checkIfNearGridTimer, keyManagerTimer;
let preview;
let windowMoving = false;
let gsettings;


// View logs with `journalctl -qf |grep -i -e Wintile -e 'js error' `
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
    config.preview.doubleWidth = gsettings.get_value('double-width').deep_unpack();
    config.ultrawideOnly = gsettings.get_value('ultrawide-only').deep_unpack();
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
    var space = null;
    if (loc.mouse) {
        var curMonitor = getCurrentMonitor();
        space = getActiveWorkspace().get_work_area_for_monitor(curMonitor);
    } else {
        space = app.get_work_area_current_monitor();
    }
    const isNotUltrawide = (space.width / space.height) < 1.9;
    _log(`moveApp) isNotUltrawide: ${isNotUltrawide}`);

    var colCount = config.ultrawideOnly && isNotUltrawide ? 2 : config.cols;
    // if the colCount >= than loc.col means that we're moving into a non-ultrawide monitor
    if (loc.col >= colCount)
        loc.col = 1;

    var rowCount = config.ultrawideOnly && isNotUltrawide ? 2 : config.rows;
    // if the rowCount >= than loc.row means that we're moving into a non-ultrawide monitor
    if (loc.row >= rowCount)
        loc.row = 1;

    var colWidth = Math.floor(space.width / colCount);
    var rowHeight = Math.floor(space.height / rowCount);

    let x = loc.col * colWidth + space.x;
    let y = loc.row * rowHeight + space.y;
    let w = loc.width * colWidth;
    let h = loc.height * rowHeight;

    if (loc.col + loc.width === colCount)
        w += space.width % colCount;

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
    if (upShift && loc.row === 1) {
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
    _log(`initApp) app: ${JSON.stringify(app)}`);
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
 */
function sendMove(direction) {
    _log('---');
    _log(`sendMove) ${direction}`);
    var app = global.display.focus_window;
    var space = app.get_work_area_current_monitor();
    var curMonitor = app.get_monitor();
    let monitorToLeft = -1;
    let monitorToRight = -1;
    // If a monitor's Y is within 100px, it's beside it.
    // Calculate monitors height difference, to account for monitors different resolution
    // If a monitor's Y is within 100px + height difference, it's beside it.
    for (var i = 0; i < Main.layoutManager.monitors.length; i++) {
        let monitorHeightDiff = Math.abs(Main.layoutManager.monitors[i].height - Main.layoutManager.monitors[curMonitor].height);
        _log(`sendMove) monitor ${i} height : ${Main.layoutManager.monitors[i].height}`);
        _log(`sendMove) monitorsHeightDiff :${monitorHeightDiff}`);

        if (Main.layoutManager.monitors[i].x < Main.layoutManager.monitors[curMonitor].x &&
            Math.abs(Main.layoutManager.monitors[i].y - Main.layoutManager.monitors[curMonitor].y) < (100 + monitorHeightDiff) &&
            (monitorToLeft === -1 || (monitorToLeft >= 0 && Main.layoutManager.monitors[i].x > Main.layoutManager.monitors[monitorToLeft].x)))
            monitorToLeft = i;

        if (Main.layoutManager.monitors[i].x > Main.layoutManager.monitors[curMonitor].x && Math.abs(Main.layoutManager.monitors[i].y - Main.layoutManager.monitors[curMonitor].y) < (100 + monitorHeightDiff) &&
            (monitorToRight === -1 || (monitorToRight >= 0 && Main.layoutManager.monitors[i].x < Main.layoutManager.monitors[monitorToRight].x)))
            monitorToRight = i;
    }
    _log(`sendMove) monitorToLeft: ${monitorToLeft}`);
    _log(`sendMove) monitorToRight: ${monitorToRight}`);

    // First, check if maximized and apply a wintile state if so
    if (!app.wintile && app.maximized_horizontally && app.maximized_vertically)
        initApp(app, true);

    const isNotUltrawide = (space.width / space.height) < 1.9;
    _log(`sendMove) isNotUltrawide: ${isNotUltrawide}`);
    var colCount = config.ultrawideOnly && isNotUltrawide ? 2 : config.cols;
    var rowCount = config.ultrawideOnly && isNotUltrawide ? 2 : config.rows;

    if (!app.wintile) {
        // We are not in a tile. Reset and find the most logical position
        _log('sendMove) Not in tile.');
        if (colCount === 2) {
            // Normal 2x2 grid
            switch (direction) {
            case 'left':
                // Move to the left most column at full height
                initApp(app);
                moveApp(app, {'row': 0, 'col': 0, 'height': rowCount, 'width': 1});
                break;
            case 'right':
                // Move to the right most column at full height
                initApp(app);
                moveApp(app, {'row': 0, 'col': 1, 'height': rowCount, 'width': 1});
                break;
            case 'up':
                // 1st Maximize
                initApp(app);
                moveApp(app, {'row': 0, 'col': 0, 'height': rowCount, 'width': colCount});
                break;
            case 'down':
                // Minimize
                requestMinimize(app);
                break;
            }
        } else if (colCount === 3) {
            // Ultrawide 3x2 grid
            switch (direction) {
            case 'left':
                // Move to the left most column at full height
                initApp(app);
                moveApp(app, {'row': 0, 'col': 0, 'height': rowCount, 'width': 1});
                break;
            case 'right':
                // Move to the right most column at full height
                initApp(app);
                moveApp(app, {'row': 0, 'col': 2, 'height': rowCount, 'width': 1});
                break;
            case 'up':
                // 1st Maximize
                initApp(app);
                moveApp(app, {'row': 0, 'col': 0, 'height': rowCount, 'width': colCount});
                break;
            case 'down':
                // Minimize
                requestMinimize(app);
                break;
            }
        } else {
            // Ultrawide 4x2 grid
            switch (direction) {
            case 'left':
                // Move to the left half at full height
                initApp(app);
                moveApp(app, {'row': 0, 'col': 0, 'height': rowCount, 'width': 2});
                break;
            case 'right':
                // Move to the right half at full height
                initApp(app);
                moveApp(app, {'row': 0, 'col': 2, 'height': rowCount, 'width': 2});
                break;
            case 'up':
                // Maximize to center 4
                initApp(app);
                moveApp(app, {'row': 0, 'col': 1, 'height': rowCount, 'width': 2});
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
        _log(JSON.stringify(app.wintile));
        if (colCount === 2) {
            // Normal 2x2 grid
            switch (direction) {
            case 'left':
                _log('sendMove) left');
                if (app.wintile.col > 0) {
                    // We can move left on this monitor and keep our size
                    _log('sendMove) left - 1');
                    moveApp(app, {'row': app.wintile.row, 'col': app.wintile.col - 1, 'height': app.wintile.height, 'width': app.wintile.width});
                } else if (app.wintile.width === colCount) {
                    // We are full width top or bottom, shrink
                    _log('sendMove) left - 2');
                    moveApp(app, {'row': app.wintile.row, 'col': 0, 'height': app.wintile.height, 'width': 1});
                } else if (monitorToLeft === -1) {
                    // We are already on the left, and there is no other monitor to the left
                    // Move to the left most column at full height
                    _log('sendMove) left - 3');
                    moveApp(app, {'row': 0, 'col': 0, 'height': rowCount, 'width': 1});
                } else {
                    // There is a monitor to the left, so let's go there
                    app.move_to_monitor(monitorToLeft);
                    _log('sendMove) left - 4');
                    moveApp(app, {'row': app.wintile.row, 'col': colCount - 1, 'height': app.wintile.height, 'width': app.wintile.width});
                }
                break;
            case 'right':
                _log('sendMove) right');
                if (app.wintile.col === 0 && app.wintile.width === colCount && app.wintile.height === rowCount) {
                    // We are maximized, move to right
                    _log('sendMove) right - 1');
                    moveApp(app, {'row': 0, 'col': 1, 'height': rowCount, 'width': 1});
                } else if (app.wintile.col === 0 && app.wintile.width === colCount) {
                    // We are a top or bottom half, shrink
                    _log('sendMove) right - 2');
                    moveApp(app, {'row': app.wintile.row, 'col': 1, 'height': rowCount, 'width': 1});
                } else if (app.wintile.col < 1) {
                    // We can move right on this monitor and keep our size
                    _log('sendMove) right - 3');
                    moveApp(app, {'row': app.wintile.row, 'col': app.wintile.col + 1, 'height': app.wintile.height, 'width': app.wintile.width});
                } else if (monitorToRight === -1) {
                    // We are already on the right, and there is no other monitor to the right
                    // Move to the right most column at full height
                    _log('sendMove) right - 4');
                    moveApp(app, {'row': 0, 'col': 1, 'height': rowCount, 'width': 1});
                } else {
                    // There is a monitor to the right, so let's go there
                    app.move_to_monitor(monitorToRight);
                    _log('sendMove) right - 5');
                    moveApp(app, {'row': app.wintile.row, 'col': 0, 'height': app.wintile.height, 'width': app.wintile.width});
                }
                break;
            case 'up':
                _log('sendMove) up');
                if (app.wintile.height === rowCount && app.wintile.width === 1) {
                    // We are full height and not maximized, go to half height
                    _log('sendMove) up - 1');
                    moveApp(app, {'row': app.wintile.row, 'col': app.wintile.col, 'height': 1, 'width': 1});
                } else if (app.wintile.row === 1) {
                    // We are bottom half, go to full height
                    _log('sendMove) up - 2');
                    moveApp(app, {'row': 0, 'col': app.wintile.col, 'height': rowCount, 'width': app.wintile.width});
                } else if (app.wintile.height === rowCount && app.wintile.width === colCount) {
                    // We are maximized, go to top half
                    _log('sendMove) up - 3');
                    moveApp(app, {'row': app.wintile.row, 'col': app.wintile.col, 'height': 1, 'width': app.wintile.width});
                } else {
                    // We are top half, maximize
                    _log('sendMove) up - 4');
                    moveApp(app, {'row': 0, 'col': 0, 'height': rowCount, 'width': colCount});
                }
                break;
            case 'down':
                _log('sendMove) down');
                if (app.wintile.col === 0 && app.wintile.width === colCount && app.wintile.height === rowCount) {
                    // We are maximized, restore
                    _log('sendMove) down - 1');
                    restoreApp(app);
                } else if (app.wintile.col === 0 && app.wintile.width === colCount && app.wintile.row === 0) {
                    // We are top half, go to bottom half
                    _log('sendMove) down - 2');
                    moveApp(app, {'row': 1, 'col': app.wintile.col, 'height': app.wintile.height, 'width': app.wintile.width});
                } else if (app.wintile.height === rowCount) {
                    // We are full height, go to half height
                    _log('sendMove) down - 3');
                    moveApp(app, {'row': 1, 'col': app.wintile.col, 'height': 1, 'width': 1});
                } else if (app.wintile.row === 0) {
                    // We are top half, go to full height
                    _log('sendMove) down - 4');
                    moveApp(app, {'row': 0, 'col': app.wintile.col, 'height': rowCount, 'width': 1});
                } else if (app.wintile.row === 1 && app.wintile.width === 1) {
                    // We are a bottom tile, go full width
                    _log('sendMove) down - 5');
                    moveApp(app, {'row': app.wintile.row, 'col': 0, 'height': app.wintile.height, 'width': colCount});
                } else {
                    // We are bottom half, minimize
                    _log('sendMove) down - 6');
                    requestMinimize(app);
                }
                break;
            }
        } else if (colCount === 3) {
            // Ultrawide 3x2 grid
            switch (direction) {
            case 'left':
                _log('sendMove) left');
                if (app.wintile.col > 0) {
                    // We can move left on this monitor and keep our size
                    _log('sendMove) left - 1');
                    moveApp(app, {'row': app.wintile.row, 'col': app.wintile.col - 1, 'height': app.wintile.height, 'width': app.wintile.width});
                } else if (app.wintile.col === 0 && app.wintile.width > 1) {
                    // We are not yet to smallest width, so shrink
                    _log('sendMove) left - 2');
                    moveApp(app, {'row': app.wintile.row, 'col': 0, 'height': app.wintile.height, 'width': app.wintile.width - 1});
                } else if (monitorToLeft !== -1) {
                    // There is a monitor to the left, so let's go there
                    _log('sendMove) left - 3');
                    app.move_to_monitor(monitorToLeft);
                    moveApp(app, {'row': app.wintile.row, 'col': colCount - 1, 'height': app.wintile.height, 'width': 1});
                } else {
                    // We are already on the left, and there is no other monitor to the left
                    // Move to the left most column at full height
                    _log('sendMove) left - 4');
                    moveApp(app, {'row': 0, 'col': 0, 'height': rowCount, 'width': 1});
                }
                break;
            case 'right':
                _log('sendMove) right');
                if (app.wintile.col + app.wintile.width - 1 < colCount - 1) {
                    // We can move right on this monitor and keep our size
                    _log('sendMove) right - 1');
                    moveApp(app, {'row': app.wintile.row, 'col': app.wintile.col + 1, 'height': app.wintile.height, 'width': app.wintile.width});
                } else if (app.wintile.col + app.wintile.width - 1 === colCount - 1 && app.wintile.width > 1) {
                    // We are not yet to smallest width, so shrink
                    _log('sendMove) right - 2');
                    moveApp(app, {'row': app.wintile.row, 'col': app.wintile.col + 1, 'height': app.wintile.height, 'width': app.wintile.width - 1});
                } else if (monitorToRight !== -1) {
                    // There is a monitor to the right, so let's go there
                    _log('sendMove) right - 3');
                    app.move_to_monitor(monitorToRight);
                    moveApp(app, {'row': app.wintile.row, 'col': 0, 'height': app.wintile.height, 'width': 1});
                } else {
                    // We are already on the left, and there is no other monitor to the right
                    // Move to the right most column at full height
                    _log('sendMove) right - 4');
                    moveApp(app, {'row': 0, 'col': colCount - 1, 'height': rowCount, 'width': 1});
                }
                break;
            case 'up':
                _log('sendMove) up');
                if (app.wintile.height === rowCount) {
                    // We are full height on half, go to top while keeping width
                    _log('sendMove) up - 1');
                    moveApp(app, {'row': 0, 'col': app.wintile.col, 'height': 1, 'width': app.wintile.width});
                } else if (app.wintile.row === 1) {
                    // We are bottom half, go to full height, keeping width
                    _log('sendMove) up - 2');
                    moveApp(app, {'row': 0, 'col': app.wintile.col, 'height': rowCount, 'width': app.wintile.width});
                } else {
                    // We are top half, go straight to 2nd maximize
                    _log('sendMove) up - 3');
                    moveApp(app, {'row': 0, 'col': 0, 'height': rowCount, 'width': colCount});
                }
                break;
            case 'down':
                _log('sendMove) down');
                if (app.wintile.col === 0 && app.wintile.width === colCount && app.wintile.height === rowCount) {
                    // We are maximized, restore
                    _log('sendMove) down - 1');
                    restoreApp(app);
                } else if (app.wintile.col === 0 && app.wintile.width === colCount && app.wintile.row === 0) {
                    // We are top half, go to bottom half
                    _log('sendMove) down - 2');
                    moveApp(app, {'row': 1, 'col': 0, 'height': app.wintile.height, 'width': app.wintile.width});
                } else if (app.wintile.height === rowCount) {
                    // We are full height, go to half height
                    _log('sendMove) down - 3');
                    moveApp(app, {'row': 1, 'col': app.wintile.col, 'height': 1, 'width': app.wintile.width});
                } else if (app.wintile.row === 0) {
                    // We are top half, go to full height
                    _log('sendMove) down - 4');
                    moveApp(app, {'row': 0, 'col': app.wintile.col, 'height': rowCount, 'width': app.wintile.width});
                } else if (app.wintile.width !== colCount) {
                    // We are not full bottom but are a tile, go full width
                    _log('sendMove) down - 5');
                    moveApp(app, {'row': 1, 'col': 0, 'height': 1, 'width': colCount});
                } else {
                    // We are bottom half, minimize
                    _log('sendMove) down - 6');
                    requestMinimize(app);
                }
                break;
            }
        } else {
            // Ultrawide 4x2 grid
            switch (direction) {
            case 'left':
                _log('sendMove) left');
                if (app.wintile.col > 0) {
                    // We can move left on this monitor and keep our size
                    _log('sendMove) left - 1');
                    moveApp(app, {'row': app.wintile.row, 'col': app.wintile.col - 1, 'height': app.wintile.height, 'width': app.wintile.width});
                } else if (app.wintile.col === 0 && app.wintile.width > 1) {
                    // We are not yet to smallest width, so shrink
                    _log('sendMove) left - 2');
                    moveApp(app, {'row': app.wintile.row, 'col': 0, 'height': app.wintile.height, 'width': app.wintile.width - 1});
                } else if (monitorToLeft !== -1) {
                    // There is a monitor to the left, so let's go there
                    _log('sendMove) left - 3');
                    app.move_to_monitor(monitorToLeft);
                    moveApp(app, {'row': app.wintile.row, 'col': colCount - 1, 'height': app.wintile.height, 'width': 1});
                } else {
                    // We are already on the left, and there is no other monitor to the left
                    // Move to the left most column at full height
                    _log('sendMove) left - 4');
                    moveApp(app, {'row': 0, 'col': 0, 'height': rowCount, 'width': 1});
                }
                break;
            case 'right':
                _log('sendMove) right');
                if (app.wintile.col + app.wintile.width - 1 < colCount - 1) {
                    // We can move right on this monitor and keep our size
                    _log('sendMove) right - 1');
                    moveApp(app, {'row': app.wintile.row, 'col': app.wintile.col + 1, 'height': app.wintile.height, 'width': app.wintile.width});
                } else if (app.wintile.col + app.wintile.width - 1 === colCount - 1 && app.wintile.width > 1) {
                    // We are not yet to smallest width, so shrink
                    _log('sendMove) right - 2');
                    moveApp(app, {'row': app.wintile.row, 'col': app.wintile.col + 1, 'height': app.wintile.height, 'width': app.wintile.width - 1});
                } else if (monitorToRight !== -1) {
                    // There is a monitor to the right, so let's go there
                    _log('sendMove) right - 3');
                    app.move_to_monitor(monitorToRight);
                    moveApp(app, {'row': app.wintile.row, 'col': 0, 'height': app.wintile.height, 'width': 1});
                } else {
                    // We are already on the left, and there is no other monitor to the right
                    // Move to the right most column at full height
                    _log('sendMove) right - 4');
                    moveApp(app, {'row': 0, 'col': colCount - 1, 'height': rowCount, 'width': 1});
                }
                break;
            case 'up':
                _log('sendMove) up');
                if (app.wintile.height === rowCount && app.wintile.width === 2 && app.wintile.col === 1) {
                    // We are in 1st maximize, go to full maximize
                    _log('sendMove) up - 1');
                    moveApp(app, {'row': 0, 'col': 0, 'height': rowCount, 'width': colCount});
                } else if (app.wintile.height === rowCount) {
                    // We are full height on half, go to top while keeping width
                    _log('sendMove) up - 2');
                    moveApp(app, {'row': 0, 'col': app.wintile.col, 'height': 1, 'width': app.wintile.width});
                } else if (app.wintile.row === 1) {
                    // We are bottom half, go to full height, keeping width
                    _log('sendMove) up - 3');
                    moveApp(app, {'row': 0, 'col': app.wintile.col, 'height': rowCount, 'width': app.wintile.width});
                } else {
                    // We are top half, go straight to 2nd maximize
                    _log('sendMove) up - 4');
                    moveApp(app, {'row': 0, 'col': 0, 'height': rowCount, 'width': colCount});
                }
                break;
            case 'down':
                _log('sendMove) down');
                if (app.wintile.col === 0 && app.wintile.width === colCount && app.wintile.height === rowCount) {
                    // We are 2nd maximized, go to 1st maximized
                    _log('sendMove) down - 1');
                    moveApp(app, {'row': 0, 'col': 1, 'height': rowCount, 'width': 2});
                } else if (app.wintile.col === 0 && app.wintile.width === colCount && app.wintile.row === 0) {
                    // We are top half, go to bottom half
                    _log('sendMove) down - 2');
                    moveApp(app, {'row': 1, 'col': 0, 'height': app.wintile.height, 'width': app.wintile.width});
                } else if (app.wintile.col === 1 && app.wintile.width === 2) {
                    // We are 1st maximized, restore
                    _log('sendMove) down - 3');
                    restoreApp(app);
                } else if (app.wintile.height === rowCount) {
                    // We are full height, go to half height
                    _log('sendMove) down - 4');
                    moveApp(app, {'row': 1, 'col': app.wintile.col, 'height': 1, 'width': app.wintile.width});
                } else if (app.wintile.row === 0) {
                    // We are top half, go to full height
                    _log('sendMove) down - 5');
                    moveApp(app, {'row': 0, 'col': app.wintile.col, 'height': rowCount, 'width': app.wintile.width});
                } else if (app.wintile.width !== colCount) {
                    // We are not full bottom but are a tile, go full width
                    _log('sendMove) down - 6');
                    moveApp(app, {'row': 1, 'col': 0, 'height': 1, 'width': colCount});
                } else {
                    // We are bottom half, minimize
                    _log('sendMove) down - 7');
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
 */
function requestMove(direction) {
    requestMoveTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 10, () => {
        sendMove(direction);
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
    if (windowMoving) {
        checkForMoveTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 10, () => {
            let [xAfter, yAfter] = global.get_pointer();
            if (x !== xAfter || y !== yAfter)
                restoreApp(app, false);
            else
                checkForMove(x, y, app);
        });
    }
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

    let [mouseX, mouseY] = global.get_pointer();
    var close = false;
    var curMonitor = getCurrentMonitor();
    var monitor = Main.layoutManager.monitors[curMonitor];
    var space = getActiveWorkspace().get_work_area_for_monitor(curMonitor);
    const isNotUltrawide = (space.width / space.height) < 1.9;
    _log(`checkIfNearGrid) isNotUltrawide: ${isNotUltrawide}`);

    var colCount = config.ultrawideOnly && isNotUltrawide ? 2 : config.cols;
    var colWidth = Math.floor(space.width / colCount);

    var rowHeight = Math.floor(space.height / config.rows);
    var inMonitorBounds = false;
    if (mouseX >= monitor.x && mouseX < monitor.x + monitor.width && mouseY >= monitor.y && mouseY < monitor.y + monitor.width)
        inMonitorBounds = true;

    let window = app.get_frame_rect();
    _log(`checkIfNearGrid) mouse - mouseX:${mouseX} mouseY:${mouseY}`);
    _log(`checkIfNearGrid) monitor - x:${monitor.x} y:${monitor.y} w:${monitor.width} h:${monitor.height} inB:${inMonitorBounds}`);
    _log(`checkIfNearGrid) space - x:${space.x} y:${space.y} w:${space.width} h:${space.height}`);
    _log(`checkIfNearGrid) window - x:${window.x} y:${window.y} w:${window.width} h:${window.height}`);
    if (inMonitorBounds) {
        for (var c = 0; c < colCount; c++) {
            var gridX = c * colWidth + space.x;
            var inGrid = mouseX > gridX && mouseX < gridX + colWidth;
            var centerOfGrid = mouseX > Math.floor(gridX + colWidth / 3) && mouseX < Math.floor(gridX + (2 * colWidth / 3));
            var topRow = mouseY < space.y + rowHeight;
            var bottomRow = mouseY > space.y + space.height - rowHeight;
            var nearTop = isClose(mouseY, space.y) || mouseY < space.y;
            var nearBottom = isClose(mouseY, space.y + space.height) || mouseY > space.y + space.height;
            var nearLeft = isClose(mouseX, space.x) || mouseX < space.x;
            var nearRight = isClose(mouseX, space.x + space.width) || mouseX > space.x + space.width;

            var centerOfScreen = space.x + Math.floor(space.width / 2);
            var columnWidthFraction = Math.floor(colWidth / 5);
            var nearCenterH = mouseX > centerOfScreen - (columnWidthFraction / 2) && mouseX < centerOfScreen + (columnWidthFraction / 2);

            var centerVerticalTop = Math.floor(space.height / 2 + space.y - rowHeight / 2);
            var centerVerticalBottom = Math.floor(space.height / 2 + space.y + rowHeight / 2);
            var nearCenterV = centerVerticalTop < mouseY && mouseY < centerVerticalBottom;

            if (nearTop && nearCenterH) {
                // If we are in the center top, show a preview for maximize
                showPreview({
                    col: 0,
                    row: 0,
                    width: colCount,
                    height: config.rows,
                }, space.x, space.y, colWidth, rowHeight);
                close = true;
                break;
            } else if (nearBottom && nearCenterH) {
                // If we are in the center bottom, show a preview for bottom maximized horizontally
                showPreview({
                    col: 0,
                    row: config.rows - 1,
                    width: colCount,
                    height: 1,
                }, space.x, space.y, colWidth, rowHeight);
                close = true;
                break;
            } else if (nearLeft && nearCenterV) {
                // If we are in the center left, show a preview for left maximize
                if (colCount === 4 && config.preview.doubleWidth) {
                    showPreview({
                        col: 0,
                        row: 0,
                        width: 2,
                        height: config.rows,
                    }, space.x, space.y, colWidth, rowHeight);
                } else {
                    showPreview({
                        col: 0,
                        row: 0,
                        width: 1,
                        height: config.rows,
                    }, space.x, space.y, colWidth, rowHeight);
                }
                close = true;
                break;
            } else if (nearRight && nearCenterV) {
                // If we are in the center right, show a preview for right maximize
                if (colCount === 4 && config.preview.doubleWidth) {
                    showPreview({
                        col: colCount - 2,
                        row: 0,
                        width: 2,
                        height: config.rows,
                    }, space.x, space.y, colWidth, rowHeight);
                } else {
                    showPreview({
                        col: colCount - 1,
                        row: 0,
                        width: 1,
                        height: config.rows,
                    }, space.x, space.y, colWidth, rowHeight);
                }
                close = true;
                break;
            } else if (nearLeft && topRow) {
                // If we are close to the top left, show the top left grid item
                if (colCount === 4 && config.preview.doubleWidth) {
                    showPreview({
                        col: 0,
                        row: 0,
                        width: 2,
                        height: 1,
                    }, space.x, space.y, colWidth, rowHeight);
                } else {
                    showPreview({
                        col: 0,
                        row: 0,
                        width: 1,
                        height: 1,
                    }, space.x, space.y, colWidth, rowHeight);
                }
                close = true;
                break;
            } else if (nearLeft && bottomRow) {
                // If we are close to the bottom left, show the bottom left grid item
                if (colCount === 4 && config.preview.doubleWidth) {
                    showPreview({
                        col: 0,
                        row: config.rows - 1,
                        width: 2,
                        height: 1,
                    }, space.x, space.y, colWidth, rowHeight);
                } else {
                    showPreview({
                        col: 0,
                        row: config.rows - 1,
                        width: 1,
                        height: 1,
                    }, space.x, space.y, colWidth, rowHeight);
                }
                close = true;
                break;
            } else if (nearRight && topRow) {
                // If we are close to the top right, show the top right grid item
                if (colCount === 4 && config.preview.doubleWidth) {
                    showPreview({
                        col: colCount - 2,
                        row: 0,
                        width: 2,
                        height: 1,
                    }, space.x, space.y, colWidth, rowHeight);
                } else {
                    showPreview({
                        col: colCount - 1,
                        row: 0,
                        width: 1,
                        height: 1,
                    }, space.x, space.y, colWidth, rowHeight);
                }
                close = true;
                break;
            } else if (nearRight && bottomRow) {
                // If we are close to the bottom right, show the bottom right grid item
                if (colCount === 4 && config.preview.doubleWidth) {
                    showPreview({
                        col: colCount - 2,
                        row: config.rows - 1,
                        width: 2,
                        height: 1,
                    }, space.x, space.y, colWidth, rowHeight);
                } else {
                    showPreview({
                        col: colCount - 1,
                        row: config.rows - 1,
                        width: 1,
                        height: 1,
                    }, space.x, space.y, colWidth, rowHeight);
                }
                close = true;
                break;
            } else if (nearTop && inGrid) {
                // If we are close to the top, show a preview for the top grid item
                showPreview({
                    col: c,
                    row: 0,
                    width: 1,
                    height: 1,
                }, space.x, space.y, colWidth, rowHeight);
                close = true;
                break;
            } else if (nearBottom && centerOfGrid) {
                // If we are close to the bottom and in the middle of a grid, show a preview for the bottom grid item at full height
                showPreview({
                    col: c,
                    row: 0,
                    width: 1,
                    height: config.rows,
                }, space.x, space.y, colWidth, rowHeight);
                close = true;
                break;
            } else if (nearBottom && inGrid) {
                // If we are close to the bottom, show a preview for the bottom grid item
                showPreview({
                    col: c,
                    row: config.rows - 1,
                    width: 1,
                    height: 1,
                }, space.x, space.y, colWidth, rowHeight);
                close = true;
                break;
            }
        }
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
 *
 */
function enable() {
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
function disable() {
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
}
