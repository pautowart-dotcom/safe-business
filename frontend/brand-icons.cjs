// Иконки приложения и фавиконки из brand/app-icon.svg (21.09.2026)
const sharp=require('sharp'),fs=require('fs');
const svg=fs.readFileSync(__dirname+'/../landing/brand/app-icon.svg');
const NAVY='#0B1220';
(async()=>{
 const targets=[['public/icons/icon-192.png',192],['public/icons/icon-512.png',512],['public/icons/apple-touch-icon.png',180],['../landing/icons/apple-touch-icon.png',180]];
 for(const [p,n] of targets) await sharp(svg,{density:300}).resize(n,n).png().toFile(__dirname+'/'+p);
 for(const p of ['public/icons','../landing/icons']) for(const n of [16,32]) await sharp(fs.readFileSync(__dirname+'/../landing/brand/favicon-'+n+'x'+n+'.png')).toFile(__dirname+'/'+p+'/favicon-'+n+'x'+n+'.png');
 // maskable: сплошной фон на весь квадрат, знак в безопасной зоне (~46%)
 const mark=fs.readFileSync(__dirname+'/../landing/brand/mark-on-dark.svg');
 const size=512,h=Math.round(size*0.46),m=await sharp(mark,{density:300}).resize({height:h}).png().toBuffer();
 await sharp({create:{width:size,height:size,channels:3,background:NAVY}}).composite([{input:m,gravity:'centre'}]).png().toFile(__dirname+'/public/icons/icon-maskable-512.png');
 console.log('icons ok');
})();
