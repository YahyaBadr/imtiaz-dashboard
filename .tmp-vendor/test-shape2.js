const fs = require('fs');
global.window = global;
global.navigator = { userAgent: 'node', product: 'node' };
global.document = { createElement: () => ({ style:{}, setAttribute(){}, appendChild(){} }), head:{appendChild(){}}, body:{appendChild(){}, removeChild(){}} };
const pdfMake = require('pdfmake/build/pdfmake.js');

// base64 of subset fonts (shortened for test: just regular+bold)
const b64 = (p) => fs.readFileSync(p).toString('base64');

async function main(){
  const ot = await import('opentype.js');
  const font = ot.loadSync('Cairo-400.ttf');
  const s = 'لوحة متابعة';
  const path = font.getPath(s, 0, 0, 24, { kerning: true });
  // get glyph names used in shaped path
  const g = font.getGlyphIndex ? null : null;
  const glyphs = font.stringToGlyphs(s);
  console.log('stringToGlyphs count:', glyphs.length, 'chars:', s.length);
  // shape via layout engine if available
  try {
    const features = {};
    const positioned = font.getPositionedGlyphs ? font.getPositionedGlyphs(s, 0, 0, 24) : null;
    if (positioned) console.log('getPositionedGlyphs available, n=', positioned.length);
  } catch(e){ console.log('no positioned api', e.message); }
  console.log('path commands:', path.commands.length);
}
main();
