# Layout des Mac-Installationsfensters (dmgbuild): links die App, rechts der Ordner „Programme“, dazwischen ein Pfeil.
# Aufruf: dmgbuild -s dmg_settings.py -D app=…/Urlaubsplanner.app -D icon=…/Urlaubsplanner.icns Urlaubsplanner out.dmg
import os.path

app = defines["app"]  # noqa: F821 – kommt von dmgbuild
app_name = os.path.basename(app)

format = "UDZO"
files = [app]
symlinks = {"Programme": "/Applications"}
icon = defines.get("icon")  # noqa: F821
badge_icon = None

background = "builtin-arrow"
window_rect = ((200, 120), (640, 320))
icon_size = 112
text_size = 14
icon_locations = {app_name: (140, 150), "Programme": (500, 150)}

show_status_bar = False
show_tab_view = False
show_toolbar = False
show_pathbar = False
show_sidebar = False
default_view = "icon-view"
