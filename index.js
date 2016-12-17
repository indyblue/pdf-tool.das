var fs = require('fs');
var path = require('path');
var promise = require('./promise.js');
var ttf = require('./ttf_parse.js');

var pdfWrite = require('./pdf-write.js');
var pdfPage = require('./pdf-page.js');
var pdfStyle = require('./pdf-style.js');
var addPropGS = promise.addPropGS;

function fnPdf() {
	var t = this;

	/***** LOCAL FUNCTIONS *****/
	var initFonts = function(fonts, fontInfo, cb) {
		var pr = promise.new();

		var cbit = function(f) {
			ttf.save('', f, null);
			fontInfo.push(f);
			pr.trigger();
		};
		for(var i=0;i<fonts.length;i++) ((ix)=> pr.next(()=> {
			ttf.parse(fonts[ix], cbit); 
		}) )(i);
		pr.finally(()=> { cb(fontInfo); })
		.start();
	};

	/***** PROPERTIES/METHODS *****/
	t.reset = function() {
		t.pages = [];
		t.fonts = [];
		t.styles = {};
		t.colors = [];
		t.cidinit = '';
	};
	t.reset();

	t.init = function(options, cb) {
		var pr = promise.new();
		if(Array.isArray(options.fonts))
			pr.next(()=> { initFonts(options.fonts, t.fonts, pr.trigger) });
		t.styles.default = pdfStyle.letter();
		if(typeof options.styles=='object') pr.next(()=>{
			for(var key in options.styles){
				var val = options.styles[key];
				if(typeof val == 'string' && typeof pdfStyle[val]=='function')
					val = pdfStyle[val]();
				if(typeof t.styles[key]!=='object') t.styles[key]={};
				promise.extend(t.styles[key],val);
			}
			pr.trigger();
		});
		else t.styles['default'] = pdfStyle['letter'];
		pr.next(()=> {
			t.page = pdfPage.add(t, t.styles['default']);
			pr.trigger();
		});
		pr.next(()=> {
			var fn = path.join(__dirname, 'ttf_cidinit.txt');
			fs.readFile(fn, (err, data)=> {
				if(err) throw err;
				//console.log(data);
				t.cidinit = data;
				pr.trigger();
			});
		})
		.finally(cb)
		.start();;
	};
	
	t.toBuffer = ()=> pdfWrite.write(t),
	t.save = function(fname, cb) {
		if(!path.isAbsolute(fname))
			fname = path.join(__dirname, fname);
		fs.writeFile(fname, t.toBuffer(), cb);
	};
	return t;
}


module.exports = {
	new: ()=> new fnPdf()
};


