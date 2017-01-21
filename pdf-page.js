var pdfStyle = require('./pdf-style.js');
var promise = require('./promise.js');
var round = promise.round;
var extend = promise.extend;
var addPropGS = promise.addPropGS;
var getValue = promise.getValue;

function objPage(options) {
	var t = this;
	t.stream = '';
	//promise.debug=true;
	extend(t, options);
	//promise.debug=false;
	t.curX = t.x0;
	t.curY = t.y0;

	t.writePage = function(op, parRef, strRef) {
		op.add(op.omake(),
			' << /Type/Page',
			'  /Parent '+parRef+' 0 R',
			'  /Contents '+strRef+' 0 R',
			'  /MediaBox [0 0 '+(t.ptwidth)+' '+(t.ptheight)+']',
			' >>','endobj');
	};
	t.writeStream = function() {
		return t.stream;
	};
}

function objPageTool(po, style) {
	var q = {}; //hidden properties
	var t = this; //visible properties
	t.pdf = po;

	//t.fstring = () => ' /F'+t.fstyle().fid+' '+t.fsize()+' Tf '
	//	+t.fstyle().flead+' TL '+t.fstyle().color+' ';
	//t.stream = {};

	//**************************************************************************
	// STYLE STORAGE, GETTING, AND MANIPULATION
	//**************************************************************************
	q.basestyle = style;
	q.incpage = function() {
		q.basestyle.page.num++;
	};
	q.stylestack = [];

	addPropGS(t, 'style', function() {
		var newdefstyle = pdfStyle.letter();
		var props = [newdefstyle, q.basestyle];
		[].push.apply(props, q.stylestack);
		var style = extend.apply(null, props);
		return style;
	});
	addPropGS(t, 'font', function() {
		var style = t.style;
		var fid = style.font.fid;
		var font = t.pdf.fonts[fid-1];
		return font;
	});

	q.fStyle = () => {
		var f = t.style.font;
		return ' /F'+f.fid+' '+f.size+' Tf '+f.lead+' TL '+f.color+' '
			+f.spacing+' Tc '+f.rise+' Ts ';
	};
	t.popStyle = function() {
		if(q.stylestack.length>0) q.stylestack.pop();
	};
	t.pushStyle = function(style) {
		if(typeof style=='string' && typeof t.pdf.styles[style]=='object')
			q.stylestack.push(t.pdf.styles[style]);
		else if(typeof style=='object')
			q.stylestack.push(style);

		// if setting a page, block or section style, finish old and start new
		// add style to stack
		// do we want to mess with this calculated lead stuff?
		/*
		var rxlead = /^(\d+)%$/;
		if(rxlead.test(flead)) {
			var lead = rxlead.exec(flead)[1] / 100;
			var font = t.pdf.fonts[t.fid-1];
			flead = t.fsize * lead * font.metric.capheight / font.metric.unitsPerEm;
			//console.log(t.fsize, lead, font.metric.capheight , font.metric.unitsPerEm, flead);
		}
		*/
	};
	//**************************************************************************

	//**************************************************************************
	// BASIC CHARACTER/WORD CONVERSIONS
	//**************************************************************************
	t.parseWord = function(word) {
		var width = 0;
		var code0 = 0;
		var karr=[];
		var txt = ' (';
		for(var i=0;i<word.length;i++){
			var aw = q.chrWidth(word[i], word[i+1]);
			if(i==0) code0 = aw.code;
			karr = aw.karr;
			width += (aw.width + aw.kern) * aw.factor;
			//console.log('aw',aw);
			var fontf = t.font.metric.unitsPerEm/t.style.font.size;
			txt += aw.chr16be;
			if(aw.code==32) txt+= ') '+q.mkJustify(1)+' (';
			else if(aw.code==9) txt+= ') '+q.mkJustify(10)+' (';
			else if(aw.kern!=0) txt+= ') '+(0-aw.kern)+' (';
		}
		txt += ') ';
		return {width: width, txt: txt, ctxt: word, code0: code0, karr: karr };
	};
	
	q.mkLineInit = function(ln) {
		ln = ln||'';
		var fontf = t.font.metric.unitsPerEm/t.style.font.size;
		//console.log('lineInit', t.style.font.size, t.font.metric.unitsPerEm);
		return ' <a{'+ln+':'+fontf+'}> ';
	};
	q.rxLineInit = /<a{(\d*):([\d.]+)}>/g;
	q.mkHardEnd = function(ln) {
		ln = ln||'';
		var fontf = t.font.metric.unitsPerEm/t.style.font.size;
		//console.log('hardEnd', t.style.font.size, t.font.metric.unitsPerEm);
		return ' <o{'+ln+':'+fontf+'}> ';
	};
	q.rxHardEnd = /<o{(\d*):([\d.]+)}>/g;
	q.mkJustify = function(elastic, ln) {
		ln = ln||'';
		elastic = elastic||1;
		var fontf = t.font.metric.unitsPerEm/t.style.font.size;
		//console.log('justify', t.style.font.size, t.font.metric.unitsPerEm);
		return ' <'+ln+'{'+elastic+':'+fontf+'}> ';
	};
	q.rxJustify = /(<)(\d*)({(\d+):([\d.]+)}>)/g;
	q.alignLineNum = function(l) {
		l.txt = l.txt.replace(q.rxJustify, function(m, ls, ln, le, i, u) {
			if(ln=='') return ls+l.xarr.length+le;
			else return m;
		});
		l.xarr.push(l.x);
	};
	q.align = function(l, type) {
		type = (type||'l').toLowerCase();
		l.ctxt += ' (a:'+type+')';
		if(type=='j') q.alignJ(l);
		else {
			l.txt = l.txt.replace(q.rxJustify, '');
			l.txt = l.txt.replace(q.rxHardEnd, '');
			l.txt = l.txt.replace(q.rxLineInit,function(m, ln, u) {
				var upe = parseFloat(u)||1;
				var sp = (l.w - (l.xarr[ln]||l.x)) * upe;
				if(type=='r') return -sp;
				else if(type=='c') return -sp/2;
				else return '';
			});
		}
	};
	q.alignJ = function(l) {
		l.txt = l.txt.replace(q.rxLineInit,'');
		var rx = q.rxJustify;
		var txt = l.txt;
		var ttl = {};
		var hend = [];
		txt = txt.replace(q.rxHardEnd, function(m, ln, u) {
			hend.push(ln);
			//* This section adds line filler after short lines, generally at the end of a block
			// currently using ~ but it should use a nice spacer, in a muted color
			t.pushStyle('tilde');
			var tilde = t.parseWord('~');
			var upe = parseFloat(u)||1;
			upe = t.font.metric.unitsPerEm/t.style.font.size;
			var sp = (l.w - (l.xarr[ln]||l.x));
			var cnt = Math.floor(sp / tilde.width)-1;
			var rem = (cnt*tilde.width - sp) * upe;
			//console.log('~~~', sp, cnt, rem, u);
			l.ctxt += ' [sp:' + sp + ', cnt:'+cnt+', rem:'+rem+', w:'+tilde.width+', u:'+u+'] ';
			if(cnt>0) {
				rem = (cnt*tilde.width - sp) * upe;
				var trep = ' ] TJ '+q.fStyle()+' [ '+rem+' '+tilde.txt.repeat(cnt);
				t.popStyle();
				return trep;
			}
			else t.popStyle();
			// */
			return '';
		});
		// need to get ttl before we can determine what spacing breakdown is
		txt = txt.replace(rx, function(m, ls, ln, le, i, u) {
			if(hend.indexOf(ln)>=0) return '';
			ttl[ln] = (ttl[ln]||0) + (parseInt(i) || 0);
			return m;
		});
		l.txt = txt.replace(rx, function(m, ls, ln, le, i, u) {
			var s = parseInt(i)||0;
			var upe = parseFloat(u)||1;
			var s2 = s/ttl[ln] * (l.w - (l.xarr[ln]||l.x) + l.endSpacing) * upe;
			return -s2;
		});
		// include info in comment text, for debugging purposes mostly
		l.ctxt += ' (w:'+l.w
			+', x:'+l.x
			+', xarr:'+JSON.stringify(l.xarr)
			+', ttl:'+JSON.stringify(ttl)
			+')';
	};

	q.chrWidth = function(chr, chr1) {
		var code = chr.charCodeAt();
		var wcode = code;
		if(code==9) {
			chr = ' ';
			code=32;
		}
		var code1 = 0;
		if(typeof chr1 != 'undefined') code1 = chr1.charCodeAt();
		var font = t.font;
		var factor = t.style.font.size / font.metric.unitsPerEm;
		var chrw = font.cw[code];
		var spacing = (t.style.font.spacing||0)/factor;
		if(typeof chrw == 'undefined') chrw = font.metric.missingWidth;
		var karr = [];
		if(code1 ==0) karr = getValue(font.kern, [code], []);
		var chrk = getValue(font.kern, [code, code1], 0);

		var ule = new Buffer(chr, 'utf16le');
		var ube = Buffer.alloc(ule.length);
		for(var j=0;j<ule.length;j++){
			ube[j] = ule[ule.length-j-1];
		}
		var chr16be = ube.toString('binary');
		
		return {width: chrw + spacing, 
			kern: chrk, 
			factor: factor, 
			karr: karr, 
			code: wcode,
			chr: chr,
			chr16be: chr16be };
	};
	//**************************************************************************

	//**************************************************************************
	// BASIC LINE MANIPULATION
	//**************************************************************************
	q.lineBuffer = [];
	q.flushLine = function(force) {
		if(typeof force=='undefined') force=0;
		var runnext=1;
		if(typeof q.curLine=='object' && q.curLine.d.a==1) {
			
			// if it's a drop line...keep dropping until it's full.
			if(q.curLine.d.y==0) {
				//console.log('0', q.curLine.d, q.curLine.ctxt);
				q.moveInLine(q.curLine.d.w, q.curLine.d.h-t.style.font.lead, force);
				q.curLine.d.y+=t.style.font.lead;
				//q.curLine.xarr.push(q.curLine.x);
				q.curLine.x = q.curLine.d.w;
				runnext=0;
			} else if(q.curLine.d.y<q.curLine.d.h) {
				//console.log('1', q.curLine.d, q.curLine.ctxt);
				q.moveInLine(0, -t.style.font.lead, force);
				q.curLine.d.y+=t.style.font.lead;
				if(q.curLine.d.y>q.curLine.height) q.curLine.height = q.curLine.d.y
				q.alignLineNum(q.curLine);
				q.curLine.x = q.curLine.d.w;
				runnext=0;
			} else {
				//console.log('2', q.curLine.d, q.curLine.ctxt);
				//console.log(q.curLine.txt);
				if(q.curLine.d.y>q.curLine.height) q.curLine.height = q.curLine.d.y
				q.moveInLine(-q.curLine.d.w, 0, force);
				q.alignLineNum(q.curLine);
			}
		} 
		
		if(runnext) {
			if(typeof q.curLine == 'object' && typeof q.curLine.ctxt=='string'
				&& q.curLine.ctxt.length>0) {
				//console.log(q.curLine.ctxt);
				var hend = '';
				if(force||0) hend = q.mkHardEnd(q.curLine.xarr.length);
				q.curLine.txt+= hend+' ] TJ ';
				q.curLine.endSpacing = t.style.font.spacing||0;

				var align = t.style.block.align;
				q.align(q.curLine, align);

				q.lineBuffer.push(q.curLine);
				//console.log('=',q.curLine.ctxt, q.curLine.lead);
			}
			q.curLine = {
				txt: q.fStyle()+' [ ' + q.mkLineInit(),
				ctxt:'',
				lead:0,
				height:0,
				endSpacing:0,
				kwn:false,
				x:0,
				xarr:[],
				w:t.style.block.xw,
				d:{a:0},
				lastChunk: {karr:[]}
			};
		}
	};
	q.writeToLine = function(txt, kern) {
		if(typeof kern=='undefined') kern=false;
		var l = q.curLine;
		if(kern) {
			var kval = 0-getValue(l.lastChunk.karr, [txt.code0], 0);
			if(kval!=0) {
				l.txt+=' '+kval+' ';
				//console.log(l.lastChunk.ctxt, txt.ctxt, kval);
			}
		}
		l.txt += txt.txt;
		l.ctxt += txt.ctxt;
		l.x+= txt.width;
		if(l.lead<t.style.font.lead) l.lead=t.style.font.lead;
		l.height = l.lead;
		l.lastChunk = txt;
	};
	q.moveInLine = function(x,y, force) {
		var hend = '';
		if(force||0) hend = q.mkHardEnd(q.curLine.xarr.length);
		q.curLine.txt+= hend+' ] TJ '+x+' '+y+' TD [ ';
	};

	q.flushLine();
	//console.log(q.space, q.dash);
	t.parseLine = function(string, flush) {
		if(typeof flush!='number') flush = 1;
		if(flush==2 || flush==3) {
			//console.log('d', t.style.block.drop);
			if(t.style.block.isDrop && q.curLine.d.a==0) {
				var dstyle = t.style.block.drop;
				var dstr = string.substr(0, dstyle.chars);
				// first push drop style, then flush line to get new style
				// then write drop, then pop style
				// last, move to correct line position.
				q.flushLine(1);
				t.pushStyle({font:dstyle});
				var dchrs = t.parseWord(dstr);
				//console.log(dchrs);
				q.flushLine(0);
				q.curLine.d= {a:1, w:dchrs.width, h:dstyle.lead, y:0};
				q.writeToLine(dchrs);
				t.popStyle();
				q.flushLine(0);
				//console.log(dstyle, dstr);
				var string = string.substr(dstyle.chars);
			}
			else q.flushLine(1);
		}
		
		// write new font style to current line buffer (cl)
		q.curLine.txt += '] TJ '+q.fStyle()+' [';

		string.replace(/([ \t\n\u00AD]+|^)([^ \t\n\u00AD]*)(?=[ \t\n\u00AD]|$)/g, function(){
			var brkChr = arguments[1];
			var txt = arguments[2];
			var nextBrk = arguments[4].substr(arguments[3]+arguments[0].length,1).charCodeAt(0) || 0;
			//console.log(brkChr, txt, arguments[3], arguments[0].length, nextBrk);
			/* procedure:
					- what do we do about multiple brkChrs?
					- get length of fragment, will it fit?
					- if not, break line. if yes, add it.
					- but if the brkChr is 173 and it won't fit, we need to add a dash to EOL.
					- and if the nextBrk is 173 and a dash won't fit after, we can't use the section.
			*/
			//console.log(arguments);
			q.fitCheck(txt, brkChr, nextBrk==173);
		});
		if(flush==1 || flush==3) q.flushLine(1); // not sure if we always want to do this or not...
	};
	q.fitCheck = function(txt, brkChr, postShy) {
		var l = q.curLine;
		var xrem = l.w-l.x;
		//console.log(l.w, l.x, l.d.a, txt);
		bcode = brkChr.charCodeAt(0) || 0;
		var chunk = t.parseWord(txt);
		var kern = false;
		if(bcode!=173 
			&& !(bcode==32 && l.x==0)
			&& !(bcode==32 && l.d.a==1 && l.x==l.d.w))
			var bChunk = t.parseWord(brkChr);
		else { 
			var bChunk = t.parseWord('');
			kern = true;
			//console.log('blank');
		}
		xrem -= bChunk.width;
		xrem -= chunk.width;
		var dash = t.parseWord('-');
		if((postShy && xrem < dash.width)
			||(!postShy && xrem < 0)) { 
			var crap = l.x; // what if we have a single word that is too long for line. what do we do then???
			if(bcode==173) q.writeToLine(dash);
			q.flushLine(0);
			if(crap!=0) q.fitCheck(txt, brkChr, postShy);
			return;
		}
		// we have enough space to use word fragment!
		//console.log(txt, bChunk);
		if(!kern) q.writeToLine(bChunk);
		q.writeToLine(chunk, kern);
		//console.log(l.ctxt, bChunk, chunk);
		//console.log(l);
	};
	//**************************************************************************

	//**************************************************************************
	// BORDER
	//**************************************************************************
	q.box = function() {
		var s = t.style.page;
		var b = ' .5 0 .5 0 K .1 w '+s.x0+' '+s.ymin+' '+s.xw+' '+s.yh+' re s ';
		//console.log(b);
		return b;
	};


	//**************************************************************************
	//**************************************************************************
	// PAGE MANIPULATION
	//**************************************************************************
	t.endPage = function() {
		if(typeof q.curPage == 'object') {
			q.curPage.stream+='\n ET ';
			t.pdf.pages.push(q.curPage);
			q.incpage();
		}
		q.curPage = new objPage(t.style.page);
		var cp = q.curPage;
		q.curPage.stream = q.box();
		var pn = t.parseWord('['+cp.num+']');
		//console.log(cp.num, pn);
		cp.stream += '\n BT '+cp.curX+' '+cp.curY+' Td '+q.fStyle()+' ['+pn.txt+'] TJ ';
	};
	t.endPage();
	t.flushPage = function() {
		q.flushLine(1);
		var ssec = t.style.section;
		var numCols = ssec.columns;
		var curCol = 1;
		var cp = q.curPage;
		for(var i=0;i<q.lineBuffer.length;i++){
			var l = q.lineBuffer[i];
			if(cp.ymin>=cp.curY-l.height) {
				if(curCol<numCols) {
					cp.stream += '\n ' + ssec.colShift + ' ' + (cp.y0 - cp.curY) + ' TD '; 
					console.log(curCol, numCols);
					cp.curY = cp.y0; curCol++;
				} else {
					t.endPage();
					cp=q.curPage;
					curCol = 1;
				}
			}
			cp.curY-= l.height;
			//console.log('=',l.ctxt, cp.curY);
			cp.stream += '\n% ' + l.ctxt
				+ '\n 0 '+(0-l.lead)+' TD ' + l.txt;
		}
		cp.stream+='\n ET ';
	}
	//**************************************************************************
	return t;
}

module.exports = {
	add: (po, style)=> new objPageTool(po, style)
};


