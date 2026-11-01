// A field given a `width` keeps it; the mark tells it from the fields that grow to fill a form row (fields.css).
export function fixedWidth(width?: number) {
  return width ? {style: {width}, 'data-fixed': ''} : undefined;
}
