import {fileURLToPath} from 'node:url';
const directory=path=>fileURLToPath(new URL(path,import.meta.url));
export default {root:directory('./'),base:'/Breathwork--Buddy/',publicDir:directory('../../public/'),build:{outDir:directory('../../../work/phase3b1-dsp-dist/'),emptyOutDir:true}};
