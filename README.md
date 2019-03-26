WinTile: Windows 10 window tiling for GNOME
===========================================
WinTile is a hotkey driven window tiling system for GNOME that imitates the standard `Win-Arrow` keys of Windows 10, allowing you to maximize, maximize to sides, or 1/4 sized to corner a window using just `<Super>`+`<Arrows>`.

<img src='demo.gif'>

Selecting the Super key
-----------------------
By default, this extension uses `<Super><Control><Shift>`+`<Arrows>` to move windows. This is because `<Super>`+`<Arrows>` is reserved by GNOME in the keyboard shortcut settings. The below script will toggle these default key bindings so you can use `<Super>`+`<Arrows>` for this extension.

To use `<Super>`+`<Arrows>` for this extension:
```
$ bash ~/.local/share/gnome-shell/extensions/windows.window.tile@nowsci.com/setHotKey.sh Super
```

To reset `<Super>`+`<Arrows>` to default for GNOME:
```
$ bash ~/.local/share/gnome-shell/extensions/windows.window.tile@nowsci.com/setHotKey.sh ControlShiftSuper
```
