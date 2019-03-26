#!/bin/bash 

if [ -z "$1" ]; then
	echo "Usage: setHotKey.sh <Super|ControlShiftSuper>"
fi

if [ "$1" = "ControlShiftSuper" ]; then
	gsettings set org.gnome.desktop.wm.keybindings unmaximize "['<Super>Down', '<Alt>F5']" >/dev/null 2>&1
	gsettings set org.gnome.desktop.wm.keybindings maximize "['<Super>Up']" >/dev/null 2>&1
	gsettings set org.cinnamon.desktop.keybindings.wm push-tile-left "['<Super>Left']" >/dev/null 2>&1
	gsettings set org.gnome.mutter.keybindings toggle-tiled-left "['<Super>Left']" >/dev/null 2>&1
	gsettings set org.cinnamon.desktop.keybindings.wm push-tile-right "['<Super>Right']" >/dev/null 2>&1
	gsettings set org.gnome.mutter.keybindings toggle-tiled-right "['<Super>Right']" >/dev/null 2>&1
	echo -e "\nNow run Alt-F2 then R to restart GNOME.\n"
fi

if [ "$1" = "Super" ]; then
	gsettings set org.gnome.desktop.wm.keybindings unmaximize "['<Control><Shift><Super>Down', '<Alt>F5']" >/dev/null 2>&1
	gsettings set org.gnome.desktop.wm.keybindings maximize "['<Control><Shift><Super>Up']" >/dev/null 2>&1
	gsettings set org.cinnamon.desktop.keybindings.wm push-tile-left "['<Control><Shift><Super>Left']" >/dev/null 2>&1
	gsettings set org.gnome.mutter.keybindings toggle-tiled-left "['<Control><Shift><Super>Left']" >/dev/null 2>&1
	gsettings set org.cinnamon.desktop.keybindings.wm push-tile-right "['<Control><Shift><Super>Right']" >/dev/null 2>&1
	gsettings set org.gnome.mutter.keybindings toggle-tiled-right "['<Control><Shift><Super>Right']" >/dev/null 2>&1
	echo -e "\nNow run Alt-F2 then R to restart GNOME.\n"
fi
