var os = require('os');
var zlib = require('zlib');
var b85 = require('base85');

function writePDF(t) {
	var op = new objPdfAppender();

	// start the file
	op.add('%PDF-1.5');
	
	// start pages
	var numroot = op.ocnt();
	op.add(
		op.omake(),
		' << /Type /Catalog',
		'  /Pages '+op.ocnt()+' 0 R',
		' >>',
		'endobj');

	console.log('pages',t.pages.length);
	var startColor = 3+(2*t.pages.length)+1;
	var startFont = startColor + t.colors.length + 1;
	
	var pagesRef = op.ocnt();
	op.add(op.omake(),
		' << /Type /Pages',
		'  /Kids '+op.ocnt()+' 0 R',
		'  /Resources <<',
		'    /Font '+startFont+' 0 R',
		'    /ColorSpace '+startColor+' 0 R',
		'  >>',
		'  /Count '+t.pages.length,
		' >>',
		'endobj');

	op.add(op.omake()).addnl('[');
	for(var i=0;i<t.pages.length;i++){
		op.addnl((op.ocnt()+i*2+1) + ' 0 R ');
	}
	op.add(']','endobj');
	for(var i=0;i<t.pages.length;i++){
		var strRef = op.ocnt();
		op.add(op.omake());
		op.addStream(t.pages[i].writeStream());
		op.add('endobj');
		t.pages[i].writePage(op, pagesRef, strRef);
	}

	// colors
	op.add(op.omake(),'<<',
		'/Cs1 [ /Separation /RedLetter /DeviceCMYK',
		' << /FunctionType 2 /Domain [0 1]',
		'  /Range [0 1 0 1 0 1 0 1]',
		'  /C0 [0 0 0 0] /C1 [0 1 1 0]',
		'  /Domain [0 1] /N 1 >> ]',
		'>>','endobj');

	// fonts
	op.add(op.omake(),'<<', '/ft << /Type/Font /Subtype/Type1 /BaseFont/Times >>');
	for(var i=0;i<t.fonts.length;i++){
		op.add('/F'+(i+1)+' '+(startFont+i*5+2)+' 0 R');
	}
	op.add('>>','endobj');
	var cidi = op.ocnt();
	op.add(op.omake());
	op.addStreamZ85(t.cidinit);
	op.add('endobj');

	for(var i=0;i<t.fonts.length;i++){
		var f = t.fonts[i];
		/* first attempt, standard truetype.
		op.add(op.omake(),'<<',
			' /Type/Font',
			' /Subtype/TrueType',
			' /BaseFont/'+(f.metric.name),
			' /Name/'+(f.metric.name),
			' /FirstChar 32 /LastChar 255');
		op.addnl(' /Widths [');
		for(var j=0;j<256;j++){
			var w = f.metric.missingWidth;
			if(typeof f.cw[j] !=='undefined') w = f.cw[j];
			op.addnl(' '+w);
		}
		op.add(' ]',' <<',
			'  /Type/FontDescriptor',
			'  /FontName/'+(f.metric.name));
		var kfd = Object.keys(f.fdesc);
		for(var j=0;j<kfd.length;j++){
			var key = kfd[j];
			var val = f.fdesc[key];
			op.add('  /'+key+' '+val);
		}
		op.add('  /FontFile2 '+op.ocnt()+' 0 R',
			' >>',
			'/Encoding /WinAnsiEncoding',
			'>>','endobj');
		*/
		op.add(op.omake(),'<<',
			'/Type /Font',
			'/Subtype /Type0',
			'/Name /F'+(i+1),
			'/Encoding /Identity-H',
			'/ToUnicode '+cidi+' 0 R',
			'/DescendantFonts ['+(op.ocnt())+' 0 R]',
			'/BaseFont /'+f.metric.name,
			'>>','endobj');
		op.add(op.omake(),'<<',
			' /Type /Font',
			' /Subtype /CIDFontType2',
			' /CIDSystemInfo << /Ordering (Identity) /Registry (Adobe) /Supplement 0 >>',
			' /BaseFont /'+(f.metric.name),
			' /DW '+f.metric.missingWidth,
			' /CIDToGIDMap '+(op.ocnt()+1)+' 0 R');
		op.addnl(' /W [');
		var keys = Object.keys(f.cw);
		var lkey = -9;
		var open = false;
		for(var j=0;j<keys.length;j++){
			var key = keys[j];
			var val = f.cw[key];
			if(key<=0 || key>=65535) continue;
			if(key-lkey!=1) {
				if(open) op.addnl(' ]');
				op.addnl(' '+key+' [');
				open=true;
			}
			op.addnl(' '+val);
			lkey = key;
		}
		if(open) op.addnl(' ]');
		op.add(' ]',
			'/FontDescriptor '+op.ocnt()+' 0 R',
			'>>','endobj');

		op.add(op.omake(),'<<',
			'  /Type /FontDescriptor',
			'  /FontName /'+(f.metric.name));
		var kfd = Object.keys(f.fdesc);
		for(var j=0;j<kfd.length;j++){
			var key = kfd[j];
			var val = f.fdesc[key];
			op.add('  /'+key+' '+val);
		}
		op.add('  /FontFile2 '+(op.ocnt()+1)+' 0 R',
			' >>',
			'>>','endobj');
		op.add(op.omake());
		op.addStreamZ85(((x)=> {
			var ctgb = Buffer.alloc(256*256*2);
			var keys = Object.keys(x);
			for(var j=0;j<keys.length;j++){
				var cid = keys[j];
				var gid = x[cid];
				if(cid>=0 && cid<=0xffff && gid>=0){
					ctgb.writeUInt16BE(gid, cid*2);
				}
			}
			return ctgb.toString('binary');
		})(f.ctg));
		
		op.add('endobj').add(op.omake());
		op.addStreamZ85(f.raw);
	}
	op.add('endobj');
	// end the file
	posxref = op.buff.length;
	op.add('xref', 
		'0 ' + op.ocnt(),
		'0'.repeat(10)+' 65535 f');
	for(var i=1;i<op.objs.length;i++)
		op.addnl(('0'.repeat(10)+op.objs[i]).slice(-10)
			+' 00000 n'+op.eol2);

	op.add(
		'trailer',
		' << /Size ' + (op.objs.length-1),
		'    /Root '+numroot+' 0 R',
		' >>',
		'startxref',
		posxref,
		'%%EOF');
	return op.buff;
}

// tool for appending to the string
function objPdfAppender() {
	var op = this;
	op.eol = os.EOL;
	op.eol2 = (' '+os.EOL).slice(-2);
	op.val = {get: ()=> op.buff.toString('binary')};
	op.buff = Buffer.alloc(0);
	op.add = function() {
		for(var i=0;i<arguments.length;i++) { 
			op.buff = Buffer.concat([op.buff, new Buffer(arguments[i] + op.eol, 'binary')]);
			//op.val += arguments[i] + op.eol;
			//if(arguments[i]=='endobj') op.val += op.eol;
		}
		return op;
	};
	op.addStream = function(str, opts) {
		var len = str.length;
		op.add('<<',' /Length ' + len);
		if(Array.isArray(opts)) {
			for(var i=0;i<opts.length;i++){
				op.add(opts[i]);
			}
		} else if(typeof opts==='object') {
			var keys = Object.keys(opts);
			for(var i=0;i<keys.length;i++) {
				op.add('  /'+keys[i]+' '+opts[keys[i]]);
			}
		}
		op.add('>>','stream',str,'endstream');
		return op;
	};
	op.addStreamZ85 = function(str, opts) {
		var l1 = str.length;

		/* // hex only
		var buff = new Buffer(str, 'binary');
		var z85 = buff.toString('hex')
			.replace(/(.{2})/g, '$1 ')
			.replace(/(.{90})/g, '$1\n');
		var filter = '[ /ASCIIHexDecode ]';
		// */

		/* // deflate and hex
		var buff = new Buffer(str, 'binary');
		var zbuff = zlib.deflateSync(buff);
		var z85 = zbuff.toString('hex')
			.replace(/(.{2})/g, '$1 ')
			.replace(/(.{90})/g, '$1\n');
		var filter = '[ /ASCIIHexDecode /FlateDecode ]';
		// */

		//* // deflate and ascii85
		var buff = new Buffer(str, 'binary');
		var zbuff = zlib.deflateSync(buff);
		var z85 = b85.encode(zbuff, 'ascii85').substr(2)
			.replace(/(.{80})/g, '$1\n');
		var filter = '[ /ASCII85Decode /FlateDecode ]';
		// */

		/* // deflate only
		var buff = new Buffer(str, 'binary');
		var zbuff = zlib.deflateSync(buff);
		var z85 = zbuff
		var filter = '[ /FlateDecode ]';
		// */

		if(Array.isArray(opts)) opts.push(' /Filter '+filter).push(' /Length1 '+l1);
		else if(typeof opts == 'object') {
			opts['Filter'] = filter;
			opts['Length1'] = l1;
		} 
		else opts = [' /Filter '+filter, ' /Length1 '+l1];
		op.addStream(z85, opts);
	};
	op.addnl = function() {
		for(var i=0;i<arguments.length;i++) 
			op.buff = Buffer.concat([op.buff, new Buffer(arguments[i], 'binary')]);
			//op.val+=arguments[i];
		return op;
	};
	op.objs = [0];
	op.omake = function() {
		op.objs.push(op.buff.length);
		return (op.objs.length-1) + ' 0 obj';
	};
	op.ocnt = ()=> op.objs.length;
};

module.exports = {
	write: writePDF,
	appender: objPdfAppender
};
