import href from '../ui/styles/palettes/halloween.css?url';
import {linkStylesheet as link} from './paletteSheet';

// The Halloween palette's stylesheet, which brings its card art and logo; paletteSheet.ts links it.
export const linkStylesheet = () => link('halloween', href);
