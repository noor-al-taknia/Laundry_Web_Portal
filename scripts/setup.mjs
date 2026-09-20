import {copyFileSync,existsSync,chmodSync} from 'node:fs';
if (!existsSync('.env.local')) {copyFileSync('.env.example','.env.local');chmodSync('.env.local',0o600);}
console.log('Local portal configuration ready.');

