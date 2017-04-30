var pdfStyle = require('./pdf-style.js');
var promise = require('promise.das');
var round = promise.round;
var extend = promise.extend;
var addPropGS = promise.addPropGS;
var getValue = promise.getValue;
var compare = promise.compare;

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

function objPageTool(po, style, hidden) {
	var q = {}; //hidden properties
	var t = this; //visible properties
	t.pdf = po;
	if(hidden) t.q = q;

	q.sw = new promise.stopwatch();

	//t.fstring = () => ' /F'+t.fstyle().fid+' '+t.fsize()+' Tf '
	//	+t.fstyle().flead+' TL '+t.fstyle().color+' ';
	//t.stream = {};

	//**************************************************************************
	// STYLE STORAGE, GETTING, AND MANIPULATION
	//**************************************************************************
	q.basestyle = style;
	q.incpage = function() {
		q.basestyle.page.num++;
		q.stylevalid = 0;
	};
	q.stylestack = [];

	q.stylevalid = 0;
	addPropGS(t, 'style', function() {
		if(q.stylevalid != 1){
			q.stylecache = q.calcstyle(q.stylestack);
			q.stylevalid = 1;
		} 
		return q.stylecache;
	});
	q.calcstyle = function(stack) {
		var style = pdfStyle.letter();
		var props = [style, q.basestyle];
		[].push.apply(props, stack);
		return extend.apply(null, props);
	};
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
		var prestyle = t.style;
		var newstyle = q.calcstyle(q.stylestack.slice(0,-1));
		var spchange = q.checkSecPageChange(prestyle, newstyle);
		q.stylevalid = 0;
		q.stylestack.pop();
		if(spchange) q.flushLine(1);
		//q.curPage.stream+='\n% popping, ' + JSON.stringify(t.style.section);
	};
	t.pushStyle = function(style) {
		var prestyle = t.style;
		if(typeof style=='string' && typeof t.pdf.styles[style]=='object')
			style = t.pdf.styles[style];
		if(typeof style=='object') {
			var spchange = q.checkSecPageChange(prestyle, style);
			q.stylevalid = 0;
			//q.curPage.stream+='\n% pushing ' + JSON.stringify(style.section);
			q.stylestack.push(style);
			if(spchange) q.flushLine(1);
		} else
			console.log('invalid style', style);
	};
	q.checkSecPageChange = function(prestyle, style) {
		var retval = 0;
		if(!compare(prestyle.section, style.section, 1)) {
			t.flushPage();
			console.log('page flush');
			retval = 1;
		} else if(!compare(prestyle.page, style.page, 1)) {
			t.endPage();
			console.log('page end');
			retval = 1;
		}
		return retval;
	}
	//**************************************************************************

	//**************************************************************************
	// BASIC CHARACTER/WORD CONVERSIONS
	//**************************************************************************
	t.parseWord = function(word, mkJ) {
		if(typeof mkJ=='undefined') mkJ = true;
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
			if(mkJ && aw.code==32) txt+= ') '+q.mkJustify(1)+' (';
			else if(mkJ && aw.code==9) txt+= ') '+q.mkJustify(10)+' (';
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
		//l.ctxt += ' (a:'+type+')';
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
		//l.ctxt += ' (w:'+l.w +', x:'+l.x +', xarr:'+JSON.stringify(l.xarr) +')';		
	};
	q.alignJ = function(l) {
		l.txt = l.txt.replace(q.rxLineInit,'');
		var rx = q.rxJustify;
		var txt = l.txt;
		var ttl = {};
		var hend = [];
		txt = txt.replace(q.rxHardEnd, function(m, ln, u, c) {
			hend.push(ln);
			//* This section adds line filler after short lines, generally at the end of a block
			// need to make a style property to turn this on/off
			t.pushStyle('tilde');
			var sc = t.parseWord(' ');
			var tilde = t.parseWord('~');
			var upe = parseFloat(u)||1;
			upe = t.font.metric.unitsPerEm/t.style.font.size;
			var sp = (l.w - (l.xarr.length>0?(l.xarr[ln]||l.w):l.x));
			var cnt = Math.floor((sp-sc.width) / tilde.width);
			var rem = (cnt*tilde.width - sp) * upe;
			//console.log('~~~', m, sp, cnt, rem, u, l.xarr, l.x, l.ctxt);
			//l.ctxt += ' ['+m+', c'+c+', sp:' + sp + ', cnt:'+cnt+', rem:'+rem+', w:'+tilde.width+', u:'+u+'] ';
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
		//if(ttl['']==1) console.log(l.w, l.xarr, l.x, ttl, l.ctxt);
		l.txt = txt.replace(rx, function(m, ls, ln, le, i, u) {
			var s = parseInt(i)||0;
			var upe = parseFloat(u)||1;
			var s2 = s/ttl[ln] * (l.w - (l.xarr[ln]||l.x) + l.endSpacing) * upe;
			return -s2;
		});
		// include info in comment text, for debugging purposes mostly
		//l.ctxt += ' (w:'+l.w +', x:'+l.x +', xarr:'+JSON.stringify(l.xarr) +', ttl:'+JSON.stringify(ttl) +')';
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
		var style = t.style;
		var font = t.font;
		var factor = style.font.size / font.metric.unitsPerEm;
		var chrw = font.cw[code];
		var spacing = (style.font.spacing||0)/factor;
		if(typeof chrw == 'undefined') chrw = font.metric.missingWidth;
		var karr = [];
		if(code1 ==0) karr = getValue(font.kern, [code], []);
		var chrk = getValue(font.kern, [code, code1], 0);

		var ube = new Buffer(chr, 'utf16le');
		ube.swap16();
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
			var fields = {};
			if(typeof q.curLine == 'object' && typeof q.curLine.ctxt=='string'
				&& q.curLine.ctxt.length>0) {
				//console.log(q.curLine.ctxt);
				var hend = '';
				if(force||0) {
					hend = q.mkHardEnd(q.curLine.xarr.length);
					q.curLine.hardEnd=1;
				}
				q.curLine.txt+= hend+' ] TJ ';
				q.curLine.endSpacing = t.style.font.spacing||0;

				var align = t.style.block.align;
				q.align(q.curLine, align);

				q.lineBuffer.push(q.curLine);
				//console.log('=',q.curLine.ctxt, q.curLine.lead);
			}
			else if(typeof q.curLine == 'object') fields = q.curLine.fields;

			q.curLine = {
				txt: q.fStyle()+' [ ' + q.mkLineInit(),
				ctxt:'',
				lead:0,
				height:0,
				endSpacing:0,
				hardEnd: 0,
				kwn:false,
				x:0,
				xarr:[],
				w:t.style.block.xw,
				d:{a:0},
				lastChunk: {karr:[]},
				fields: fields
			};
		}
	};
	q.fields = {};
	t.clearFields = function() {
		q.fields = {};
	};
	t.setField = function(key, val) {
		q.curLine.fields[key] = val;
		//console.log(key, val, q.curLine.fields);
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
	t.parseLine = function(string, flush, fields) {
		q.sw.start('parseLine');
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
		extend(q.curLine.fields, fields);

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
		q.sw.stop();
		//console.log(q.sw.print());
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
			var htxt = q.pageHeader(1);
			//console.log(htxt);
			q.curPage.stream+='\n ET '+htxt;
			t.pdf.pages.push(q.curPage);
			q.incpage();
		}
		q.curPage = new objPage(t.style.page);
		var cp = q.curPage;
		//q.curPage.stream = q.box();
		//var pn = t.parseWord('['+cp.num+']');
		var htxt = q.pageHeader(-1);
		//console.log(cp.num, pn);
		cp.stream += '\n BT '+cp.curX+' '+cp.curY+' Td '+htxt+' ';
	};
	q.pageHeader = function(posFlag) {
		var hstyle = q.curPage.header;
		if(typeof hstyle == 'string') {
			q.curPage.header = hstyle = { right: hstyle, left: hstyle };
		} 
		
		if(typeof hstyle == 'object') {
			
			if(typeof hstyle.s=='undefined') {
				if(q.curPage.num%2==0) hstyle.s = hstyle.left;
				else hstyle.s = hstyle.right;
			}
			if(typeof hstyle.x=='undefined') hstyle.x = q.curPage.x0;
			if(typeof hstyle.y=='undefined') hstyle.y = q.curPage.y0;

			hstyle.s = q.mergeReplace(hstyle.s, posFlag);
			
			if(posFlag>0 && (
				typeof hstyle.suppress!='object'
				|| hstyle.suppress.indexOf(q.curPage.num)<0)) {
				var stylePush = true;
				if(typeof hstyle.font == 'string') t.pushStyle(hstyle.font);
				else if(typeof hstyle.font == 'object') t.pushStyle({font:hstyle.font});
				else stylePush = false;

				harr = hstyle.s.split('\t',3);
				var cy = 0, w = q.curPage.xw;
				var htxt = '';
				htxt += q.fStyle();
				htxt += ' [ ';
				if(harr.length>0 && typeof harr[0]=='string' && harr[0].length>0) {
					var val = t.parseWord(harr[0], false);
					htxt += ' '+val.txt;
					cy += val.width;
				}
				if(harr.length>1 && typeof harr[1]=='string' && harr[1].length>0) {
					var val = t.parseWord(harr[1], false);
					var fontf = t.font.metric.unitsPerEm/t.style.font.size;
					var offset = (w - val.width)/2 - cy;
					htxt += ' '+(0-offset*fontf);
					htxt += ' '+val.txt;
					cy += val.width + offset;
				}
				if(harr.length>2 && typeof harr[2]=='string' && harr[2].length>0) {
					var val = t.parseWord(harr[2], false);
					var fontf = t.font.metric.unitsPerEm/t.style.font.size;
					var offset = (w - val.width - cy);
					htxt += ' '+(0-offset*fontf);
					htxt += ' '+val.txt;
					cy += val.width + offset;
				}
				htxt += ' ] TJ ';
				
				// change from fill to stroke
				var color = t.style.font.color.replace(/[a-z]/g, (x)=> x.toUpperCase());
				htxt = '\n BT '+hstyle.x+' '+(hstyle.y+1)+' Td '+htxt+' ET '
					+color+' .25 w '+hstyle.x+' '+hstyle.y+' m '+(hstyle.x+w)+' '+hstyle.y+' l S ';
				if(stylePush) t.popStyle();
				return htxt;
			}
		}
		return '';
	};
	q.mergeReplace = function(txt, posFlag) {
		return txt.replace(/{([-+]?)([^}]*)}/g, function(m, pos, field){
			if(field == '#') return q.curPage.num;
			// for fields, we need a pos to tell us if we want the value
			// at the beginning or end of the page.
			else if(typeof q.fields[field] != 'undefined'
				&& ( (posFlag>0 && pos=='+')
					|| (posFlag<0 && pos=='-') )) 
				return q.fields[field];
			return m;
		});
	};
	t.endPage();
	t.flushPage = function() {
		q.flushLine(1);
		var ssec = t.style.section;

		var bufArr = ()=> {
			var t = [];
			t.h = function() {
				var h = 0;
				for(var i=0;i<t.length;i++){
					h += t[i].height||0;
				}
				return h;
			};
			t.elastics = function() {
				var he = [];
				for(var i=1;i<t.length;i++){
					if(t[i].hardEnd==1 && i<t.length-1) he.push(i+1);
				}
				return he;
			};
			t.lh = function() {
				return t[t.length-1].height;
			};
			return t;
		};
		var fncmp = (a,b)=> Math.pow(a,2)+Math.pow(b,2);
		
		// each page will be an iteration of while loop
		while(q.lineBuffer.length>0){
			var curCol = 1;
			var cp = q.curPage;
			cp.numCols = ssec.columns;
			cp.colBufs = [];
			var map = () => cp.colBufs.map((x)=> x.h()- ttlH/cp.numCols );
			cp.curY = cp.y0;
			var pageDone = false;
			// get all the lines we can for the page...unshift them into a new column buffer?
			while(q.lineBuffer.length>0){
				var l = q.lineBuffer[0];
				if(cp.ymin>=cp.curY-l.height) {
					if(curCol<cp.numCols) {
						cp.curY = cp.y0; 
						curCol++;
					} else {
						pageDone=true;
						break;
					}
				}
				if(typeof cp.colBufs[curCol-1]=='undefined') cp.colBufs[curCol-1] = bufArr();
				var cbuf = cp.colBufs[curCol-1];
				q.lineBuffer.shift();
				cbuf.push(l);
				//cbuf.h = (cbuf.h||0) + l.height;
				cp.curY -= l.height;
			}

			// once we have them in a col buffer, we need to balance the lengths,
			// and do vertical align
			if(!pageDone){
				var ttlH = 0;
				for(var i=0;i<cp.numCols;i++) {
					if(typeof cp.colBufs[i] == 'undefined') cp.colBufs[i] = bufArr();
					ttlH += cp.colBufs[i].h();
				}
				var kmax = 1;
				for(var i=0;i<100;i++) {
					var action = false;
					for(var j=0;j<(m=map()).length-1;j++){
						var mj = m[j], lh = cp.colBufs[j].lh(), subaction = false, cmp=0, cmpb=0;
						for(var k=j+1;k<Math.min(j+kmax+1,m.length);k++) {
							var mk = m[k];
							cmpb += fncmp(mj, mk);
							cmp += fncmp(mj-lh, mk+lh);
							if(cmpb > cmp){
								subaction=true;
								break;
							}
							mj = mk + lh;
						}
						if(subaction) {
							var l = cp.colBufs[j].pop();
							cp.colBufs[j+1].unshift(l);
							action=true;
						} 
					}
					//console.log('ttl', i, ttlH, ttlH/cp.numCols, map());
					if(!action) {
						if(kmax>=m.length) break;
						kmax++;
					}
				}
				
			}

			cp.stream += '\n% begin flush '+cp.y0;
			// then we need to write the data and either end the page, 
			// or reset the y0 so that a future write will start at the correct place
			//console.log(' -cols',pageDone, cp.colBufs.length);
			var maxh = cp.y0 - cp.ymin,
				prevH = 0;
			if(q.lineBuffer.length==0) {
				var harr = cp.colBufs.map((a)=> a.h());
				var maxh = Math.max.apply(null, harr);
			}
			for(var i=0;i<cp.colBufs.length;i++){
				var cbuf = cp.colBufs[i];
				var minLead = Math.min.apply(null, cbuf.map((a)=> a.lead));
				var elastics = cbuf.elastics();
				var ha = cbuf.h();

				// vertical align
				var eadd = 0;
				var supere = 0;
				if(elastics.length>0) eadd = (maxh - ha) / elastics.length;
				else supere = (maxh-ha) / (cbuf.length-1);
				if(supere>.1*minLead) supere = 0;
				console.log('eadd', elastics.length, maxh, ha);

				//console.log(cbuf.elastics(), maxh, ha, eadd, 'se', cbuf.length, supere, minLead);
				cp.stream += `\n% column ${i}/${cp.colBufs.length} sH:${prevH}`;
				if(i>0) {
					var shiftH = prevH;
					cp.stream += '\n ' + ssec.colShift + ' ' + shiftH + ' TD '; 
				}
				//console.log('  -line', i, cbuf.length, cbuf.h());
				prevH = 0;
				for(var j=0;j<cbuf.length;j++){
					var l = cbuf[j];
					var lead = (0-l.lead) 
					if(j>0) lead -= supere;
					if(j>0 && elastics.indexOf(j)>=0) lead -= eadd;
					extend(q.fields, l.fields);
					//if(Object.keys(l.fields).length>0) console.log(cp.num, q.fields, l.fields);
					prevH -= lead - l.height + l.lead;
					console.log(round(lead,1), round(prevH,1), i, j, l.ctxt);
					cp.stream += '\n% ' + l.ctxt
						+ '\n 0 '+lead+' TD ' + l.txt;
				}
				var prevH = ha + eadd * elastics.length;
			}
			cp.stream += '\n% end flush\n';

			if(pageDone) t.endPage();
			else {
				var xoff = (-ssec.colShift*(cp.colBufs.length-1));
				var yoff = - maxh + prevH;
				cp.stream += `\n ${xoff} ${yoff} TD `; 
				cp.y0 -=  maxh;
				console.log('y1', cp.y0, maxh);
				
			}
			//console.log('end', q.lineBuffer.length);
		}
	}
	//**************************************************************************
	return t;
}

module.exports = {
	add: (po, style)=> new objPageTool(po, style, false)
};


