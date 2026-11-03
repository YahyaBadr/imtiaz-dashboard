const fs = require('fs');
global.window = global;
global.navigator = { userAgent: 'node', product: 'node' };
global.document = { createElement: () => ({ style:{}, setAttribute(){}, appendChild(){} }),
                   head: {appendChild(){}}, body: {appendChild(){}, removeChild(){}} };
const pdfMake = require('pdfmake/build/pdfmake.js');
pdfMake.vfs = {};
pdfMake.vfs['Cairo-Regular.ttf'] = fs.readFileSync('Cairo-400.ttf').toString('base64');
pdfMake.vfs['Cairo-SemiBold.ttf'] = fs.readFileSync('Cairo-600.ttf').toString('base64');
pdfMake.vfs['Cairo-Bold.ttf'] = fs.readFileSync('Cairo-700.ttf').toString('base64');
pdfMake.fonts = { Cairo: { normal:'Cairo-Regular.ttf', bold:'Cairo-Bold.ttf', italics:'Cairo-Regular.ttf', bolditalics:'Cairo-Bold.ttf' } };
const dd = {
  content: [
    { text:'لوحة متابعة الإمتياز البيطري — كلية الطب البيطري جامعة القاهرة', style:'title' },
    { text:'إجمالي الطلاب: 566 طالب/ة · غير مسجلين: 37', style:'body' },
    { table:{ headerRepeat:true, widths:['auto','*','*'],
      body:[ ['الجروب','الإجمالي','التصنيف'], ['جروب ١','28','مختلط'], ['جروب 2','29','ذكور'] ] }, layout:'lightGridLines' }
  ],
  styles:{ title:{font:'Cairo',fontSize:16,alignment:'right',bold:true}, body:{font:'Cairo',fontSize:11,alignment:'right'} },
  defaultStyle:{font:'Cairo',fontSize:10}
};
const out = pdfMake.createPdf(dd);
out.getBuffer((buf) => { fs.writeFileSync('test.pdf', buf); console.log('PDF written', buf.length, 'bytes'); },
              (err) => { console.error('ERR', err); });
