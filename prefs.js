'use strict';

const Gio = imports.gi.Gio;
const Gtk = imports.gi.Gtk;
const GObject = imports.gi.GObject;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const Gettext = imports.gettext;
const _ = Gettext.domain('wintile').gettext;

function init() {
}

function createColOptions(){
    let options = [
        { name: _("2") },
        { name: _("3") },
        { name: _("4"),}
    ];
    let liststore = new Gtk.ListStore();
    liststore.set_column_types([GObject.TYPE_STRING])
    for (let i = 0; i < options.length; i++ ) {
        let option = options[i];
        let iter = liststore.append();
        liststore.set (iter, [0], [option.name]);
    }
    return liststore;
}

function buildPrefsWidget() {
    // Copy the same GSettings code from `extension.js`
    let gschema = Gio.SettingsSchemaSource.new_from_directory(
        Me.dir.get_child('schemas').get_path(),
        Gio.SettingsSchemaSource.get_default(),
        false
    );

    this.settings = new Gio.Settings({
        settings_schema: gschema.lookup('org.gnome.shell.extensions.wintile', true)
    });

    let rendererText = new Gtk.CellRendererText();

    // Create a parent widget that we'll return from this function
    let layout = new Gtk.Grid({
        margin: 18,
        column_spacing: 12,
        row_spacing: 12,
        visible: true
    });
    
    // Add a simple title and add it to the layout
    let title = new Gtk.Label({
        label: `<b>${Me.metadata.name} Extension Preferences</b>`,
        halign: Gtk.Align.CENTER,
        use_markup: true,
        visible: true
    });
    layout.attach(title, 0, 0, 2, 1);
    
    // Column setting
    let colsLabel = new Gtk.Label({
        label: _("Number of columns"),
        visible: true,
        hexpand: true,
        halign: Gtk.Align.START
    });
    let colsInput = new Gtk.ComboBox({
        model: createColOptions(),
        visible: true
    });
    colsInput.pack_start (rendererText, false);
    colsInput.add_attribute (rendererText, "text", 0);
    layout.attach(colsLabel, 0, 1, 1, 1);
    layout.attach(colsInput, 1, 1, 1, 1);

    // Maximize setting
    let maximizeLabel = new Gtk.Label({
        label: _("Use true maximizing of windows"),
        visible: true,
        hexpand: true,
        halign: Gtk.Align.START
    });
    let maximizeInput = new Gtk.Switch({
        active: this.settings.get_boolean ('use-maximize'),
        halign: Gtk.Align.END,
        visible: true
    });
    layout.attach(maximizeLabel, 0, 2, 1, 1);
    layout.attach(maximizeInput, 1, 2, 1, 1);

    // Preview setting
    let previewLabel = new Gtk.Label({
        label: _("Turn on mouse dragging support"),
        visible: true,
        hexpand: true,
        halign: Gtk.Align.START
    });
    let previewInput = new Gtk.Switch({
        active: this.settings.get_boolean ('preview'),
        halign: Gtk.Align.END,
        visible: true
    });
    layout.attach(previewLabel, 0, 3, 1, 1);
    layout.attach(previewInput, 1, 3, 1, 1);

    // Debug setting
    let debugLabel = new Gtk.Label({
        label: _("Turn on debugging"),
        visible: true,
        hexpand: true,
        halign: Gtk.Align.START
    });
    let debugInput = new Gtk.Switch({
        active: this.settings.get_boolean ('debug'),
        halign: Gtk.Align.END,
        visible: true
    });
    layout.attach(debugLabel, 0, 4, 1, 1);
    layout.attach(debugInput, 1, 4, 1, 1);

    this.settings.bind('cols', colsInput, 'active', Gio.SettingsBindFlags.DEFAULT);
    this.settings.bind('use-maximize', maximizeInput, 'active', Gio.SettingsBindFlags.DEFAULT);
    this.settings.bind('preview', previewInput, 'active', Gio.SettingsBindFlags.DEFAULT);
    this.settings.bind('debug', debugInput, 'active', Gio.SettingsBindFlags.DEFAULT);

    // Return our widget which will be added to the window
    return layout;
}