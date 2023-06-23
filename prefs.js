'use strict';

const Gio = imports.gi.Gio;
const Gtk = imports.gi.Gtk;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const Gettext = imports.gettext;
const _ = Gettext.domain('wintile').gettext;

const Config = imports.misc.config;
const SHELL_VERSION = parseFloat(Config.PACKAGE_VERSION);

/**
 *
 */
function init() {
    // empty
}

/**
 *
 */
function buildPrefsWidget() {
    // Create a parent widget that we'll return from this function
    let layout = new Gtk.Grid({
        margin_bottom: 18,
        margin_end: 18,
        margin_start: 18,
        margin_top: 18,
        column_spacing: 12,
        row_spacing: 12,
        visible: true,
    });

    let gsettings;
    gsettings = ExtensionUtils.getSettings();
    layout._gsettings = gsettings;

    let row = 0;

    // Add a simple title and add it to the layout
    let title = new Gtk.Label({
        label: `<b>${Me.metadata.name} Extension Preferences</b>`,
        halign: Gtk.Align.CENTER,
        use_markup: true,
        visible: true,
    });
    layout.attach(title, 0, row++, 2, 1);

    // Column setting
    let colsLabel = new Gtk.Label({
        label: _('Number of columns'),
        visible: true,
        hexpand: true,
        halign: Gtk.Align.START,
    });
    let colsInput = new Gtk.Box({
        orientation: Gtk.Orientation.HORIZONTAL,
        visible: true,
    });
    let colsAdjustment = new Gtk.Adjustment({
        lower: 2,
        upper: 4,
        step_increment: 1,
    });
    let colsSettingInt = new Gtk.SpinButton({
        adjustment: colsAdjustment,
        snap_to_ticks: true,
        visible: true,
    });
    colsSettingInt.set_value(gsettings.get_int('cols'));
    if (SHELL_VERSION >= 40)
        colsInput.append(colsSettingInt);
    else
        colsInput.add(colsSettingInt);

    layout.attach(colsLabel, 0, row, 1, 1);
    layout.attach(colsInput, 1, row++, 1, 1);

    // 16:9 and 16:10 always 2x2 setting
    let ultrawideOnlyLabel = new Gtk.Label({
        label: _('Treat monitors <= 16:9 as 2x2'),
        visible: true,
        hexpand: true,
        halign: Gtk.Align.START,
    });
    let ultrawideOnlyInput = new Gtk.Switch({
        active: gsettings.get_boolean('ultrawide-only'),
        halign: Gtk.Align.END,
        visible: true,
    });
    layout.attach(ultrawideOnlyLabel, 0, row, 1, 1);
    layout.attach(ultrawideOnlyInput, 1, row++, 1, 1);

    // Maximize setting
    let maximizeLabel = new Gtk.Label({
        label: _('Use true maximizing of windows'),
        visible: true,
        hexpand: true,
        halign: Gtk.Align.START,
    });
    let maximizeInput = new Gtk.Switch({
        active: gsettings.get_boolean('use-maximize'),
        halign: Gtk.Align.END,
        visible: true,
    });
    layout.attach(maximizeLabel, 0, row, 1, 1);
    layout.attach(maximizeInput, 1, row++, 1, 1);

    // Minimize setting
    let minimizeLabel = new Gtk.Label({
        label: _('Allow minimizing of windows'),
        visible: true,
        hexpand: true,
        halign: Gtk.Align.START,
    });
    let minimizeInput = new Gtk.Switch({
        active: gsettings.get_boolean('use-minimize'),
        halign: Gtk.Align.END,
        visible: true,
    });
    layout.attach(minimizeLabel, 0, row, 1, 1);
    layout.attach(minimizeInput, 1, row++, 1, 1);

    // Preview settings
    let previewEnabled = gsettings.get_boolean('preview');
    let previewLabel = new Gtk.Label({
        label: _('Enable preview and snapping when dragging windows'),
        visible: true,
        hexpand: true,
        halign: Gtk.Align.START,
    });
    let previewInput = new Gtk.Switch({
        active: previewEnabled,
        halign: Gtk.Align.END,
        visible: true,
    });
    layout.attach(previewLabel, 0, row, 1, 1);
    layout.attach(previewInput, 1, row++, 1, 1);

    // Double width previews
    let doubleWidthLabel = new Gtk.Label({
        label: _('     Use double width previews on sides in 4 column mode'),
        visible: true,
        hexpand: true,
        halign: Gtk.Align.START,
    });
    let doubleWidthInput = new Gtk.Switch({
        active: gsettings.get_boolean('double-width'),
        halign: Gtk.Align.END,
        visible: true,
    });
    layout.attach(doubleWidthLabel, 0, row, 1, 1);
    layout.attach(doubleWidthInput, 1, row++, 1, 1);

    // Preview distance
    let previewDistanceLabel = new Gtk.Label({
        label: _('     Pixels from edge to start preview'),
        visible: true,
        hexpand: true,
        halign: Gtk.Align.START,
    });
    let previewDistanceInput = new Gtk.Box({
        orientation: Gtk.Orientation.HORIZONTAL,
        visible: true,
    });
    let previewDistanceAdjustment = new Gtk.Adjustment({
        lower: 0,
        upper: 150,
        step_increment: 1,
    });
    let previewDistanceSettingInt = new Gtk.SpinButton({
        adjustment: previewDistanceAdjustment,
        snap_to_ticks: true,
        visible: true,
    });
    previewDistanceSettingInt.set_value(gsettings.get_int('distance'));
    if (SHELL_VERSION >= 40)
        previewDistanceInput.append(previewDistanceSettingInt);
    else
        previewDistanceInput.add(previewDistanceSettingInt);

    layout.attach(previewDistanceLabel, 0, row, 1, 1);
    layout.attach(previewDistanceInput, 1, row++, 1, 1);

    // Delay
    let previewDelayLabel = new Gtk.Label({
        label: _('     Delay in ms before preview displays'),
        visible: true,
        hexpand: true,
        halign: Gtk.Align.START,
    });
    let previewDelayInput = new Gtk.Box({
        orientation: Gtk.Orientation.HORIZONTAL,
        visible: true,
    });
    let previewDelayAdjustment = new Gtk.Adjustment({
        lower: 25,
        upper: 1000,
        step_increment: 1,
    });
    let previewDelaySettingInt = new Gtk.SpinButton({
        adjustment: previewDelayAdjustment,
        snap_to_ticks: true,
        visible: true,
    });
    previewDelaySettingInt.set_value(gsettings.get_int('delay'));
    if (SHELL_VERSION >= 40)
        previewDelayInput.append(previewDelaySettingInt);
    else
        previewDelayInput.add(previewDelaySettingInt);

    layout.attach(previewDelayLabel, 0, row, 1, 1);
    layout.attach(previewDelayInput, 1, row++, 1, 1);

    // Gap setting
    let gapLabel = new Gtk.Label({
        label: _('Gap width around tiles'),
        visible: true,
        hexpand: true,
        halign: Gtk.Align.START,
    });
    let gapInput = new Gtk.Box({
        orientation: Gtk.Orientation.HORIZONTAL,
        visible: true,
    });
    let gapAdjustment = new Gtk.Adjustment({
        lower: 0,
        upper: 50,
        step_increment: 2,
    });
    let gapSettingInt = new Gtk.SpinButton({
        adjustment: gapAdjustment,
        snap_to_ticks: true,
        visible: true,
    });
    gapSettingInt.set_value(gsettings.get_int('gap'));
    if (SHELL_VERSION >= 40)
        gapInput.append(gapSettingInt);
    else
        gapInput.add(gapSettingInt);

    layout.attach(gapLabel, 0, row, 1, 1);
    layout.attach(gapInput, 1, row++, 1, 1);

    // Debug setting
    let debugLabel = new Gtk.Label({
        label: _('Turn on debugging'),
        visible: true,
        hexpand: true,
        halign: Gtk.Align.START,
    });
    let debugInput = new Gtk.Switch({
        active: gsettings.get_boolean('debug'),
        halign: Gtk.Align.END,
        visible: true,
    });
    layout.attach(debugLabel, 0, row, 1, 1);
    layout.attach(debugInput, 1, row++, 1, 1);

    const bindSettings = (key, input) => {
        gsettings.bind(key, input, 'active', Gio.SettingsBindFlags.DEFAULT);
    };

    const connectAndSetInt = (setting, key) => {
        setting.connect('value-changed', entry => {
            gsettings.set_int(key, entry.value);
        });
    };

    // settings that aren't toggles need a connect
    connectAndSetInt(colsSettingInt, 'cols');
    connectAndSetInt(previewDistanceSettingInt, 'distance');
    connectAndSetInt(previewDelaySettingInt, 'delay');
    connectAndSetInt(gapSettingInt, 'gap');

    // all other settings need a bind
    bindSettings('ultrawide-only', ultrawideOnlyInput);
    bindSettings('use-maximize', maximizeInput);
    bindSettings('use-minimize', minimizeInput);
    bindSettings('preview', previewInput);
    bindSettings('double-width', doubleWidthInput);
    bindSettings('debug', debugInput);

    // Return our widget which will be added to the window
    return layout;
}
