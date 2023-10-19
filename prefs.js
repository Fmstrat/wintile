'use strict';

const Gio = imports.gi.Gio;
const Gtk = imports.gi.Gtk;
const Adw = imports.gi.Adw;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const Gettext = imports.gettext;
const _ = Gettext.domain('wintile').gettext;

/**
 *
 */
function init() {
    // empty
}

/**
 *
 * @param {object} window - Don't worry about this. Gnome handles it for you.
 */
function fillPreferencesWindow(window) {
    let gsettings;
    gsettings = ExtensionUtils.getSettings();

    const gridPage = new Adw.PreferencesPage({
        name: 'Dimensions',
        title: 'Dimensions',
        icon_name: 'preferences-desktop-apps-symbolic',
    });
    window.add(gridPage);

    const gridGroup = new Adw.PreferencesGroup({
        title: 'Grid size',
        description: `Configure the rows and columns of ${Me.metadata.name}`,
    });
    gridPage.add(gridGroup);

    // COLUMNS
    const colsRow = new Adw.ActionRow({
        title: 'Columns',
    });
    gridGroup.add(colsRow);

    let colsSettingInt = new Gtk.SpinButton({
        adjustment: new Gtk.Adjustment({
            'lower': 1,
            'step-increment': 1,
            'upper': 5,
            'value': gsettings.get_int('cols'),
        }),
    });
    colsRow.add_suffix(colsSettingInt);

    // ROWS
    const rowsRow = new Adw.ActionRow({
        title: 'Rows',
    });
    gridGroup.add(rowsRow);

    let rowsSettingInt = new Gtk.SpinButton({
        adjustment: new Gtk.Adjustment({
            'lower': 1,
            'step-increment': 1,
            'upper': 5,
            'value': gsettings.get_int('rows'),
        }),
    });
    rowsRow.add_suffix(rowsSettingInt);

    // ULTRAWIDE
    const ultrawideOnlyRow = new Adw.ActionRow({
        title: 'Use different rows and columns for non-ultrawide monitors',
    });
    gridGroup.add(ultrawideOnlyRow);

    const ultrawideOnlyInput = new Gtk.CheckButton();
    ultrawideOnlyRow.add_suffix(ultrawideOnlyInput);
    ultrawideOnlyRow.set_activatable_widget(ultrawideOnlyInput);
    ultrawideOnlyInput.active = gsettings.get_boolean('ultrawide-only');

    // preference group
    const nonUltrawideGroup = new Adw.PreferencesGroup({
        title: 'Number of columns for non-ultrawide',
        description: 'Configure the separate rows and columns of non-ultrawides',
    });
    gridPage.add(nonUltrawideGroup);

    // NON-ULTRAWIDE COLUMNS
    const nonUltraColsRow = new Adw.ActionRow({
        title: 'Columns',
    });
    nonUltrawideGroup.add(nonUltraColsRow);

    let nonUltraColsSettingInt = new Gtk.SpinButton({
        adjustment: new Gtk.Adjustment({
            'lower': 1,
            'step-increment': 1,
            'upper': 5,
            'value': gsettings.get_int('non-ultra-cols'),
        }),
    });
    nonUltraColsRow.add_suffix(nonUltraColsSettingInt);

    // NON-ULTRAWIDE ROWS
    const nonUltraRowsRow = new Adw.ActionRow({
        title: 'Rows',
    });
    nonUltrawideGroup.add(nonUltraRowsRow);

    let nonUltraRowsSettingInt = new Gtk.SpinButton({
        adjustment: new Gtk.Adjustment({
            'lower': 1,
            'step-increment': 1,
            'upper': 5,
            'value': gsettings.get_int('non-ultra-rows'),
        }),
    });
    nonUltraRowsRow.add_suffix(nonUltraRowsSettingInt);

    const behaviorPage = new Adw.PreferencesPage({
        name: 'Behavior',
        title: 'Behavior',
        icon_name: 'applications-system-symbolic',
    });
    window.add(behaviorPage);

    const behaviorGroup = new Adw.PreferencesGroup({
        title: 'Behavior',
    });
    behaviorPage.add(behaviorGroup);

    // Maximize setting
    const maximizeRow = new Adw.ActionRow({
        title: 'Use true maximizing of windows',
    });
    behaviorGroup.add(maximizeRow);

    const maximizeInput = new Gtk.CheckButton();
    maximizeRow.add_suffix(maximizeInput);
    maximizeRow.set_activatable_widget(maximizeInput);
    maximizeInput.active = gsettings.get_boolean('use-maximize');

    // Minimize setting
    const minimizeRow = new Adw.ActionRow({
        title: 'Use true miniming of windows',
    });
    behaviorGroup.add(minimizeRow);

    const minimizeInput = new Gtk.CheckButton();
    minimizeRow.add_suffix(minimizeInput);
    minimizeRow.set_activatable_widget(minimizeInput);
    minimizeInput.active = gsettings.get_boolean('use-minimize');

    // Preview settings
    const previewRow = new Adw.ActionRow({
        title: 'Enable preview and snapping when dragging windows',
    });
    behaviorGroup.add(previewRow);

    const previewInput = new Gtk.CheckButton();
    previewRow.add_suffix(previewInput);
    previewRow.set_activatable_widget(previewInput);
    previewInput.active = gsettings.get_boolean('preview');

    // Preview distance
    const previewDistanceRow = new Adw.ActionRow({
        title: 'Pixels from edge to start preview',
    });
    behaviorGroup.add(previewDistanceRow);

    let previewDistanceSettingInt = new Gtk.SpinButton({
        adjustment: new Gtk.Adjustment({
            'lower': 0,
            'step-increment': 1,
            'upper': 150,
            'value': gsettings.get_int('distance'),
        }),
    });
    previewDistanceRow.add_suffix(previewDistanceSettingInt);


    // Delay
    const previewDelayRow = new Adw.ActionRow({
        title: 'Delay in ms before preview displays',
    });
    behaviorGroup.add(previewDelayRow);

    let previewDelaySettingInt = new Gtk.SpinButton({
        adjustment: new Gtk.Adjustment({
            'lower': 25,
            'step-increment': 1,
            'upper': 1000,
            'value': gsettings.get_int('delay'),
        }),
    });
    previewDelayRow.add_suffix(previewDelaySettingInt);


    // Double width previews
    const doubleWidthRow = new Adw.ActionRow({
        title: 'Use double width previews on sides in 4 and 5 column mode',
    });
    behaviorGroup.add(doubleWidthRow);

    const doubleWidthInput = new Gtk.CheckButton();
    doubleWidthRow.add_suffix(doubleWidthInput);
    doubleWidthRow.set_activatable_widget(doubleWidthInput);
    doubleWidthInput.active = gsettings.get_boolean('double-width');

    // Gap setting
    const gapRow = new Adw.ActionRow({
        title: 'Gap width around tiles',
    });
    behaviorGroup.add(gapRow);

    let gapSettingInt = new Gtk.SpinButton({
        adjustment: new Gtk.Adjustment({
            'lower': 0,
            'step-increment': 2,
            'upper': 50,
            'value': gsettings.get_int('gap'),
        }),
    });
    gapRow.add_suffix(gapSettingInt);

    // Debug setting
    const debugRow = new Adw.ActionRow({
        title: 'Turn on debugging',
    });
    behaviorGroup.add(debugRow);

    const debugInput = new Gtk.CheckButton();
    debugRow.add_suffix(debugInput);
    debugRow.set_activatable_widget(debugInput);
    debugInput.active = gsettings.get_boolean('debug');



    const bindSettings = (key, input) => {
        gsettings.bind(key, input, 'active', Gio.SettingsBindFlags.DEFAULT);
    };

    const connectAndSetInt = (setting, key) => {
        setting.connect('value-changed', entry => {
            gsettings.set_int(key, entry.value);
        });
    };

    const toggleUltrawide = () => {
        if (ultrawideOnlyInput.active) {
            // Show rows and columns options
            nonUltrawideGroup.show();
        } else {
            // Hide rows and columns options
            nonUltrawideGroup.hide();
        }
    };


    // settings that aren't toggles need a connect
    connectAndSetInt(colsSettingInt, 'cols');
    connectAndSetInt(rowsSettingInt, 'rows');
    connectAndSetInt(nonUltraColsSettingInt, 'non-ultra-cols');
    connectAndSetInt(nonUltraRowsSettingInt, 'non-ultra-rows');
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
    ultrawideOnlyInput.connect('notify::active', toggleUltrawide);

    // make sure that the non-ultrawide menu is hidden unless it's enabled
    toggleUltrawide();
}
