'use strict';

/* BEGIN NON-G45 */
const Gio = imports.gi.Gio;
const Gtk = imports.gi.Gtk;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
/* END NON-G45 */

/* BEGIN G45 */
// import Gio from 'gi://Gio';
// import Gtk from 'gi://Gtk';
// import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
/* END G45 */

/* BEGIN NON-G45 */
function buildPrefsWidget() {
/* END NON-G45 */

/* BEGIN G45 */
// export default class WinTileExtensionPreferences extends ExtensionPreferences {
//     fillPreferencesWindow(window) {
/* END G45 */

        let builder = Gtk.Builder.new();

        /* BEGIN NON-G45 */
        builder.add_from_file(`${Me.path}/settings.ui`);
        /* END NON-G45 */

        /* BEGIN G45 */
        // builder.add_from_file(`${this.path}/settings.ui`);
        /* END G45 */

        let gridPage = builder.get_object('gridPage');
        let behaviorPage = builder.get_object('behaviorPage');

        /* BEGIN NON-G45 */
        let window = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 10,
            margin_top: 20,
            margin_bottom: 20,
            margin_start: 20,
            margin_end: 20
        });
        window.append(gridPage);
        window.append(behaviorPage);
        let gsettings = ExtensionUtils.getSettings();
        /* END NON-G45 */

        /* BEGIN G45 */
        // window.add(gridPage);
        // window.add(behaviorPage);
        // let gsettings = this.getSettings();
        /* END G45 */

        const bindSettings = (key, input) => {
            key.value = gsettings.get_value(input).deep_unpack();
            gsettings.bind(input, key, 'active', Gio.SettingsBindFlags.DEFAULT);
        };

        const connectAndSetInt = (key, input) => {
            key.value = gsettings.get_value(input).deep_unpack();
            key.connect('value-changed', entry => {
                gsettings.set_int(input, entry.value);
            });
        };

        let ultrawideOnlyInput = builder.get_object('ultrawideOnlyInput');
        let nonUltrawideGroup = builder.get_object('nonUltrawideGroup');

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
        connectAndSetInt(builder.get_object('colsSettingInt'), 'cols');
        connectAndSetInt(builder.get_object('rowsSettingInt'), 'rows');
        connectAndSetInt(builder.get_object('nonUltraColsSettingInt'), 'non-ultra-cols');
        connectAndSetInt(builder.get_object('nonUltraRowsSettingInt'), 'non-ultra-rows');
        connectAndSetInt(builder.get_object('previewDistanceSettingInt'), 'distance');
        connectAndSetInt(builder.get_object('previewDelaySettingInt'), 'delay');
        connectAndSetInt(builder.get_object('gapSettingInt'), 'gap');

        // all other settings need a bind
        bindSettings(builder.get_object('ultrawideOnlyInput'), 'ultrawide-only');
        bindSettings(builder.get_object('maximizeInput'), 'use-maximize');
        bindSettings(builder.get_object('minimizeInput'), 'use-minimize');
        bindSettings(builder.get_object('previewInput'), 'preview');
        bindSettings(builder.get_object('doubleWidthInput'), 'double-width');
        bindSettings(builder.get_object('debugInput'), 'debug');
        ultrawideOnlyInput.connect('notify::active', toggleUltrawide);

        // make sure that the non-ultrawide menu is hidden unless it's enabled
        toggleUltrawide();

        /* BEGIN NON-G45 */
        return window;
        /* END NON-G45 */
    }
/* BEGIN G45 */
// }
/* END G45 */

/* BEGIN NON-G45 */
function init() {
    console.log('init');
}
/* END NON-G45 */
