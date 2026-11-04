import antd from '../ui/styles/palettes/antd.css?url';
import arco from '../ui/styles/palettes/arco.css?url';
import catppuccin from '../ui/styles/palettes/catppuccin.css?url';
import kary from '../ui/styles/palettes/kary.css?url';
import nord from '../ui/styles/palettes/nord.css?url';
import qiangguo from '../ui/styles/palettes/qiangguo.css?url';
import semi from '../ui/styles/palettes/semi.css?url';
import {linkStylesheet as link} from './paletteSheet';

// The stylesheets of the families that bring nothing but their tokens; paletteSheet.ts links them. Glass (glass.ts)
// and Halloween (halloween.ts) have modules of their own. Their names stay out of the startup bundle with this module.
export const sheets = {antd, arco, catppuccin, kary, nord, qiangguo, semi};
export const linkStylesheet = (family: keyof typeof sheets) => link(family, sheets[family]);
