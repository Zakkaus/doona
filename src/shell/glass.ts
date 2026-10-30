import href from '../ui/styles/glass.css?url';
import {linkStylesheet as link} from './paletteSheet';
import {loadWallpaper} from './wallpaper';

// The Glass palettes' stylesheet and wallpaper, which no other palette needs; paletteSheet.ts links the stylesheet.
export const linkStylesheet = () => link('glass', href);
void loadWallpaper();
