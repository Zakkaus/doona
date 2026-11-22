Fixed

- The routing templates no longer send `geosite:google-cn` directly. That list holds `www.gstatic.com`, which serves the YouTube TV interface icons and fonts and is unreachable from mainland China, so those icons stayed blank. Routing written by an earlier template is still recognised as that template.
