Added

- The DNS query tab gains a geosite type: `geosite:<code>` lists a category's
  entries and a bare domain reverse-looks-up the categories containing it.
  The answer comes from Loyalsoldier's geosite.dat, downloaded from a CDN and
  decoded in the browser, so no backend geodata endpoint is needed. The file
  is cached locally and revalidated in the background; long listings page at
  500 entries instead of truncating.
