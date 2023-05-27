WinTile: Windows 10 window tiling for GNOME
===========================================
WinTile is a hotkey driven window tiling system for GNOME that imitates the
standard `Win-Arrow` keys of Windows 10, allowing you to maximize, maximize
to sides, or 1/4 sized to corner a window using just `<Super>`+`<Arrows>`.

WinTile also supports:
- 2, 3, or 4 columns for standard or ultrawide monitors
- Mouse preview and snapping for placing tiles
- "Maximize" mode, which adds/removes GNOME animations
- Ultrawide-only mode limits 16:9 screens to a 2x2 grid

Usage:
Moving with arrow key:
Pressing `<Super>`+`<Arrows>` will move tile around the screen.
- `<Super>`+`<Up>` will maximize your tile with a few different levels
	- Maximized vertically in the current column
	- Maximized horizontally in the top row
	- If you're using 4 col mode, it will maximize in the center at double-width first

- `<Super>`+`<Left>` or `<Super>`+`<Right>`
	- Move a tile in that direction. If it's at the edge of a screen, it will go full-height
	- If a tile is more than 1 column wide and on the edge in that direction
 it will shrink by 1 column

- `<Super>`+`<Down>` will maximize your tile with a few different levels
	- If you're already maximized in 4 col mode, it will downsize in the center at double-width 
	- If maximized vertically, it will shrink to the bottom row
	- If minimizing is enabled, the tile will disappear to the task bar

Moving with the mouse:
Dragging a window around the edge of the screen will create a preview of
where that tile will snap.

There are a few zones to be aware of
- Top Center maximizes a window
- Bottom Center maximizes horizontally in the bottom row
- In the center of any column on the bottom row will maximize vertically in that column
- Right or left center will maximize vertically in a column
    - If using 4 columns and double-width is enabled, it will maximize on that half of the screen

- Any other zone along the edge will create a 1x1 tile


WinTile can be found on the GNOME Extension site:

https://extensions.gnome.org/extension/1723/wintile-windows-10-window-tiling-for-gnome/

<img src='demo.gif'>

# Configuration from a browser
1. Visit https://extensions.gnome.org/local/
1. Click on the "Configure this extension" button.

# Configuration from gnome-tweaks
1. Open `Extension` settings in [Gnome Tweaks](https://gitlab.gnome.org/GNOME/gnome-tweaks)
1. locate `Wintile` and click on the cogwheel button to bring up the configuration dialog.
