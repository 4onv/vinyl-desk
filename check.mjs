import {readdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('./',import.meta.url));
for(const file of (await readdir(root)).filter(name=>/\.(m?js)$/.test(name))){
  const result=spawnSync(process.execPath,['--check',file],{cwd:root,stdio:'inherit',windowsHide:true});
  if(result.error)throw result.error;
  if(result.status)process.exit(result.status);
}
console.log('All JavaScript syntax checks passed.');
