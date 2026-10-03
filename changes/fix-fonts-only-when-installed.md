Fixed

- Without the optional font archive, the UI no longer requests the Noto Sans TC and SC files and logs no 404s for them; it checks for the archive once per page load and declares the faces only when it is installed.
