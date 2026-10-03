Internal

- Each stylesheet is imported by the module that renders its rules: the page header rules join the global page layout, and the widget content and impact list rules get their own files, so a page opened first is styled without another page's chunk; the UI is unchanged.
