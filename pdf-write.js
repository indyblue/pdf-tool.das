var os = require('os');
var zlib = require('zlib');
var b85 = require('base85');
var promise = require('promise.das');
var round = promise.round;
var arraydim = promise.arraydim;

async function writePDF(t) {
	var op = new objPdfAppender();

	// start the file
	op.add('%PDF-1.5');

	// start pages
	var numroot = op.ocnt();
	op.add(
		op.omake(),
		' << /Type /Catalog',
		'  /Pages ' + op.ocnt() + ' 0 R',
		' >>',
		'endobj');

	var refs = {};

	var pagesRef = op.ocnt();
	op.add(op.omake(),
		' << /Type /Pages',
		'  /Kids [', op.startapp('pagearr'),
		'   ]',
		'  /Resources <<',
		'    /Font ' + op.relref('fonts', 0) + ' 0 R',
		'    /ColorSpace ' + op.relref('colors', 0) + ' 0 R',
		'  >>',
		'  /Count ' + op.startapp('pagecnt'),
		' >>',
		'endobj');

	var pcnt = t.pages.length;
	var rup = (i, m) => i - (i % m || m) + m;
	if (t.layout) {
		var tl = t.layout;
		if (tl.book) {
			var bkpg = rup(pcnt, 4);
			var sigpg = (tl.sig || 0) * 4;
			if (sigpg)
				bkpg = rup(pcnt, sigpg);
			else sigpg = bkpg;
			var sigs = bkpg / sigpg;
			var pgs = [];
			for (var j = 0; j < sigs; j++) {
				for (var i = 1; i <= sigpg / 2; i++) {
					// first/last pages of current sig
					var side = [j * sigpg + i];
					if (side > pcnt) side = [0];
					var side2 = sigpg * (j + 1) - i + 1;
					if (side2 > pcnt) side2 = 0;
					if (i % 2 == 1) side.unshift(side2);
					else side.push(side2);
					pgs.push(side);
				}
			}
			if (tl.stack) {
				var spcnt = rup(pgs.length / 2, 2);
				var spgs = [];
				for (var i = 0; i < spcnt; i++) {
					spgs.push([].concat(pgs[i], (pgs[spcnt + i] || [0, 0])));
				}
				pgs = spgs;
			}
		}
	}
	var pgwritten = 0;
	for (var i = 0; i < t.pages.length; i++) {
		var strRef = op.ocnt();
		t.pages[i].streamRef = strRef;
		op.add(op.omake());
		op.addStream(t.pages[i].writeStream());
		op.add('endobj');
		if (!pgs) {
			op.addapp('pagearr', op.ocnt() + ' 0 R ');
			t.pages[i].writePage(op, pagesRef, strRef);
			pgwritten++;
		}
		//console.log('page',i+1, t.pages.length);
	}

	if (pgs && pgs.length) {
		var w = t.pages[0].ptwidth * 2;
		var h = t.pages[0].ptheight;
		if (t.layout.stack) h *= 2;
		var Q = op.ocnt() + ' 0 R';
		op.add(op.omake()).addStream('Q').add('endobj');
		var q1 = op.ocnt() + ' 0 R';
		op.add(op.omake()).addStream('q 1 0 0 1 0 0 cm').add('endobj');
		var q2 = op.ocnt() + ' 0 R';
		op.add(op.omake()).addStream('q 1 0 0 1 ' + (w / 2) + ' 0 cm').add('endobj');
		var qtop = op.ocnt() + ' 0 R';
		op.add(op.omake()).addStream('q 1 0 0 1 0 ' + (h / 2) + ' cm').add('endobj');
		var qflip = op.ocnt() + ' 0 R';
		op.add(op.omake()).addStream('q -1 0 0 -1 ' + w + ' ' + (h / 2) + ' cm').add('endobj');
		var lswc = '.1 w 0 .2 .2 0 K ';
		var vls = op.ocnt() + ' 0 R';
		op.add(op.omake()).addStream(lswc + (w / 2) + ' 0 m ' + (w / 2) + ' ' + h + ' l S').add('endobj');
		var hls = op.ocnt() + ' 0 R';
		op.add(op.omake()).addStream(lswc + '0 ' + (h / 2) + ' m ' + w + ' ' + (h / 2) + ' l S').add('endobj');
		//% flip (origin is top right corner in this case)
		// q -1 0 0 -1 1000 750 cm
		for (var i = 0; i < pgs.length; i++) {
			var p = pgs[i];
			var strefs = p.map(x => x > 0 ? t.pages[x - 1].streamRef + ' 0 R' : '');
			op.addapp('pagearr', op.ocnt() + ' 0 R ');
			op.add(op.omake(),
				' << /Type/Page',
				'  /Parent ' + pagesRef + ' 0 R',
				'  /Contents [');
			if (t.layout.stack) op.add(qtop, q1, strefs[0], Q, q2, strefs[1], Q, Q,
				qflip, q1, strefs[2], Q, q2, strefs[3], Q, Q, vls, hls);
			else op.add(q1, strefs[0], Q, q2, strefs[1], Q, vls);
			op.add(']',
				'  /MediaBox [0 0 ' + w + ' ' + h + ']',
				' >>', 'endobj');
			console.log(p, strefs);
			pgwritten++;
		}
	}

	console.log('pages', pgwritten);
	op.addapp('pagecnt', pgwritten);
	op.addapp('pagecnt', '');
	op.addapp('pagearr', '');

	// colors
	refs.colors = op.ocnt();
	op.add(op.omake(), '<<',
		'/CsRed [ /Separation /RedLetter /DeviceCMYK',
		' << /FunctionType 2 /Domain [0 1]',
		'  /Range [0 1 0 1 0 1 0 1]',
		'  /C0 [0 0 0 0] /C1 [0 1 1 0]',
		'  /Domain [0 1] /N 1 >> ]',
		'/CsBlack [ /Separation /BlackLetter /DeviceCMYK',
		' << /FunctionType 2 /Domain [0 1]',
		'  /Range [0 1 0 1 0 1 0 1]',
		'  /C0 [0 0 0 0] /C1 [1 1 1 1]',
		'  /Domain [0 1] /N 1 >> ]',
		'>>', 'endobj');

	// fonts
	refs.fonts = op.ocnt();
	console.log('fonts', t.fonts.length);
	op.add(op.omake(), '<<', '/ft << /Type/Font /Subtype/Type1 /BaseFont/Times >>',
		op.startapp('fontarr'), '>>', 'endobj');
	var cidi = op.ocnt();
	op.add(op.omake());
	op.addStreamZ85(t.cidinit);
	op.add('endobj');

	for (var i = 0; i < t.fonts.length; i++) {
		var f = t.fonts[i];
		op.addapp('fontarr', '/F' + (i + 1) + ' ' + op.ocnt() + ' 0 R\n');
		op.add(op.omake(), '<<',
			'/Type /Font',
			'/Subtype /Type0',
			'/Name /F' + (i + 1),
			'/Encoding /Identity-H',
			'/ToUnicode ' + cidi + ' 0 R',
			'/DescendantFonts [' + (op.ocnt()) + ' 0 R]',
			'/BaseFont /' + f.metric.name,
			'>>', 'endobj');
		op.add(op.omake(), '<<',
			' /Type /Font',
			' /Subtype /CIDFontType2',
			' /CIDSystemInfo << /Ordering (Identity) /Registry (Adobe) /Supplement 0 >>',
			' /BaseFont /' + (f.metric.name),
			' /DW ' + f.metric.missingWidth,
			' /CIDToGIDMap ' + (op.ocnt() + 1) + ' 0 R');
		op.addnl(' /W [');
		var keys = Object.keys(f.cw);
		var lkey = -9;
		var open = false;
		for (var j = 0; j < keys.length; j++) {
			var key = keys[j];
			var val = f.cw[key];
			if (key <= 0 || key >= 65535) continue;
			if (key - lkey != 1) {
				if (open) op.addnl(' ]');
				op.addnl(' ' + key + ' [');
				open = true;
			}
			op.addnl(' ' + val);
			lkey = key;
		}
		if (open) op.addnl(' ]');
		op.add(' ]',
			'/FontDescriptor ' + op.ocnt() + ' 0 R',
			'>>', 'endobj');

		op.add(op.omake(), '<<',
			'  /Type /FontDescriptor',
			'  /FontName /' + (f.metric.name));
		var kfd = Object.keys(f.fdesc);
		for (var j = 0; j < kfd.length; j++) {
			var key = kfd[j];
			var val = f.fdesc[key];
			if (typeof val == 'number') val = round(val, 2);
			op.add('  /' + key + ' ' + val);
		}
		op.add('  /FontFile2 ' + (op.ocnt() + 1) + ' 0 R',
			' >>',
			'>>', 'endobj');
		op.add(op.omake());
		op.addStreamZ85(((x) => {
			var ctgb = Buffer.alloc(256 * 256 * 2);
			var keys = Object.keys(x);
			for (var j = 0; j < keys.length; j++) {
				var cid = keys[j];
				var gid = x[cid];
				if (cid >= 0 && cid <= 0xffff && gid >= 0) {
					ctgb.writeUInt16BE(gid, cid * 2);
				}
			}
			return ctgb.toString('binary');
		})(f.ctg));

		op.add('endobj').add(op.omake());
		let raw = await f.raw();
		op.addStreamZ85(raw);
	}
	op.addapp('fontarr', '');

	op.add('endobj');
	// end the file
	op.fixrelrefs(refs);
	console.log('xref', op.objs.length);
	posxref = op.buff.length;
	op.add('xref',
		'0 ' + op.ocnt(),
		'0'.repeat(10) + ' 65535 f');
	for (var i = 1; i < op.objs.length; i++)
		op.addnl(('0'.repeat(10) + op.objs[i]).slice(-10)
			+ ' 00000 n' + op.eol2);

	op.add(
		'trailer',
		' << /Size ' + (op.objs.length - 1),
		'    /Root ' + numroot + ' 0 R',
		' >>',
		'startxref',
		posxref,
		'%%EOF');
	console.log('%%eof');
	return op.buff();
}

// tool for appending to the string
function objPdfAppender() {
	var op = this;
	op.eol = os.EOL;
	op.eol2 = (' ' + os.EOL).slice(-2);
	op.val = ''; //{get: ()=> op.buff.toString('binary')};
	op.buff = () => new Buffer(op.val, 'binary'); //Buffer.alloc(0);
	op.add = function () {
		for (var i = 0; i < arguments.length; i++) {
			//op.buff = Buffer.concat([op.buff, new Buffer(arguments[i] + op.eol, 'binary')]);
			op.val += arguments[i] + op.eol;
			//if(arguments[i]=='endobj') op.val += op.eol;
		}
		return op;
	};
	op.addStream = function (str, opts) {
		var len = str.length;
		op.add('<<', ' /Length ' + len);
		if (Array.isArray(opts)) {
			for (var i = 0; i < opts.length; i++) {
				op.add(opts[i]);
			}
		} else if (typeof opts === 'object') {
			var keys = Object.keys(opts);
			for (var i = 0; i < keys.length; i++) {
				op.add('  /' + keys[i] + ' ' + opts[keys[i]]);
			}
		}
		op.add('>>', 'stream', str, 'endstream');
		return op;
	};
	op.addStreamZ85 = function (str, opts) {
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

		if (Array.isArray(opts)) opts.push(' /Filter ' + filter).push(' /Length1 ' + l1);
		else if (typeof opts == 'object') {
			opts['Filter'] = filter;
			opts['Length1'] = l1;
		}
		else opts = [' /Filter ' + filter, ' /Length1 ' + l1];
		op.addStream(z85, opts);
	};
	op.addnl = function () {
		for (var i = 0; i < arguments.length; i++)
			//op.buff = Buffer.concat([op.buff, new Buffer(arguments[i], 'binary')]);
			op.val += arguments[i];
		return op;
	};
	op.objs = [0];
	op.relref = (rel, off) => '{{' + rel + (off >= 0 ? '+' : '-') + off + '}}';
	op.fixrelrefs = function (refo) {
		var keys = Object.keys(refo);
		//console.log('relrefs', refo, keys);
		for (var i = 0; i < keys.length; i++) {
			var rx = new RegExp('\\{\\{(' + keys[i] + ')([-+]\\d+)?\\}\\}', 'ig');
			//console.log(rx);
			op.val = op.val.replace(rx, function (m, key, off) {
				console.log(key, off, refo[key] + parseInt(off));
				return refo[key] + parseInt(off);
			});
		}
		op.val.replace(/(\d+) 0 obj/g, function (m, i, pos) {
			//console.log([i], op.objs[i], pos);
			op.objs[i] = pos;
		});
	};
	op.startapp = ref => '{{~~' + ref + '~~}}';
	op.addapp = (ref, txt) => {
		var rx = new RegExp('\\{\\{~~(' + ref + ')~~\\}\\}', 'ig');
		//console.log(rx);
		op.val = op.val.replace(rx, function (m, key, off) {
			//console.log(key, txt);
			if (txt == '') return '';
			else return txt + ' ' + m;
		});
	};
	op.omake = function () {
		op.objs.push(op.val.length);
		return (op.objs.length - 1) + ' 0 obj';
	};
	op.ocnt = () => op.objs.length;
};

module.exports = {
	write: writePDF,
	appender: objPdfAppender
};
