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

	var newdefstyle = pdfStyle.letter();
	addPropGS(t, 'style', function() {
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
		return ' /F'+f.fid+' '+f.size+' Tf '+f.lead+' TL '+f.color+' ';
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
		var txt = ' (';
		for(var i=0;i<word.length;i++){
			var aw = q.chrWidth(word[i], word[i+1]);
			width += (aw[0] + aw[1]) * aw[2];
			//console.log('aw',aw);
			var ule = new Buffer(word[i], 'utf16le');
			var ube = Buffer.alloc(ule.length);
			for(var j=0;j<ule.length;j++){
				ube[j] = ule[ule.length-j-1];
			}
			txt += ube.toString('binary');
			if(aw[1]!=0) txt+= ') '+(0-aw[1])+' (';
		}
		txt += ') ';
		return [width, txt, word];
	};

	q.chrWidth = function(chr, chr1) {
		var code = chr.charCodeAt();
		var code1 = 0;
		if(typeof chr1 != 'undefined') code1 = chr1.charCodeAt();
		var font = t.font;
		var factor = t.style.font.size / font.metric.unitsPerEm;
		var chrw = font.cw[code];
		if(typeof chrw == 'undefined') chrw = font.metric.missingWidth;
		var chrk = getValue(font.kern, [code, code1], 0);
		return [chrw, chrk, factor];
	};
	//**************************************************************************

	//**************************************************************************
	// BASIC LINE MANIPULATION
	//**************************************************************************
	q.lineBuffer = [];
	q.flushLine = function() {
		if(typeof q.curLine == 'object' && typeof q.curLine.txt=='string'
			&& q.curLine.txt.length>0) {
			q.curLine.txt+= ' ] TJ ';
			q.lineBuffer.push(q.curLine);
			//console.log('=',q.curLine.ctxt, q.curLine.lead);
		}
		q.curLine = {
			txt: q.fStyle()+' [ ',
			ctxt:'',
			lead:0,
			height:0,
			kwn:false,
			x:0,
			w:t.style.block.xw
		};
	};
	q.writeToLine = function(txt) {
		var l = q.curLine;
		l.txt += txt[1];
		l.ctxt += txt[2];
		l.x+= txt[0];
		if(l.lead<t.style.font.lead) l.lead=t.style.font.lead;
		l.height = l.lead;
	};

	q.flushLine();
	q.space = t.parseWord(' ');
	q.dash = t.parseWord('-');
	//console.log(q.space, q.dash);
	t.parseLine = function(string, flush) {
		if(typeof flush!='number') flush = 1;
		if(flush>1) q.flushLine(); // not sure if we always want to do this or not...
		
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
		if(flush>0) q.flushLine(); // not sure if we always want to do this or not...
	};
	q.fitCheck = function(txt, brkChr, postShy) {
		var l = q.curLine;
		var xrem = l.w-l.x;
		bcode = brkChr.charCodeAt(0) || 0;
		var chunk = t.parseWord(txt);
		if(bcode!=173 && !(bcode==32 && l.x==0)) var bChunk = t.parseWord(brkChr);
		else { 
			var bChunk = t.parseWord('');
			//console.log('blank');
		}
		xrem -= bChunk[0];
		xrem -= chunk[0];
		if((postShy && xrem < q.dash[0])
			||(!postShy && xrem < 0)) { 
			var crap = l.x; // what if we have a single word that is too long for line. what do we do then???
			if(bcode==173) q.writeToLine(q.dash);
			q.flushLine();
			if(crap!=0) q.fitCheck(txt, brkChr, postShy);
			return;
		}
		// we have enough space to use word fragment!
		//console.log(txt, bChunk);
		q.writeToLine(bChunk);
		q.writeToLine(chunk);
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
		cp.stream += '\n BT '+cp.curX+' '+cp.curY+' Td '+q.fStyle()+' ['+pn[1]+'] TJ ';
	};
	t.endPage();
	t.flushPage = function() {
		var cp = q.curPage;
		for(var i=0;i<q.lineBuffer.length;i++){
			var l = q.lineBuffer[i];
			if(cp.ymin>=cp.curY-l.height) {
				t.endPage();
				cp=q.curPage;
			}
			cp.curY-= l.lead;
			//console.log('=',l.ctxt, cp.curY);
			cp.stream += '\n% ' + l.ctxt
				+ '\n 0 '+(0-l.lead)+' TD ' + l.txt;
		}
		cp.stream+='\n ET ';
	}
	//**************************************************************************
	return t;
}

/*
	
	a page consists of: 
		inputs (defStyle)
		internals: blocks.
		- how to represent parallel text?
			- do we do this on the block level? representing that blocks are linked somehow?
			- or at the page level?
	
	
	
	each block consists of:
		inputs: (x,y,defStyle,w)
		internals: h, lines[]
		- x/y = coords to top left of block
		- defStyle: font, size, leading, color, alignment
		- l = leading for first line
		- blocks will be BT/ET units.
			- when written, "BT x y Td l TD" will be added to beginning
			- "ET" will be added to end
		- blocks will be built line by line.
			- at least one block must be added to the page.
			- it will default to start at the top left margin.
			- default width will be width of page from left to right margin
		- if a new line will go past end of page:
			- create new page after current, based on current
			- create new block on new page.
			- remove line from current block, add to new block
			- how to handle keep-w/-next and orphan/widow?
				- track back through lines, and any with kwn gets bumped also
				- 
	
	lines consist of:
		width, defStyle, words (array)
		- width = max width
		- alignment = left, center, right, justify
		- lines will be built word by word. 
		- if adding a word would make the line too long:
			- array of words will be written to line
			- words array will be emptied and start over.
			- OR...do we keep words array, 
				- add a param to the words for spacing, 
				- then have a .toString() that prints it?

	words consist of:
		[ width, spaceFactor, text, u16Text]
		width = final width of all contents of word block
		spaceFactor = spacing factor used for justify
			- all factors will be summed, 
			- total space needed will be divided up by percentage.
		text = plain text, however entered
		u16Text = the ucs16(BE) desired by pdf.
		- kerning spacing will be built into u16Text: ") n ("
		- need a delimiter to mark where the justify spacing will go.
		- how will we handle tab stops?
			- alignment will automatically become left if tabs are used
			- tab alignment may be set for that piece


	i think i should define an array of styles at the beginning, and then refer to them
	throughout.
		- easiest method would be to just reset every single param every time
		- cleanest method for final pdf would be to diff between prev/next style, 
			and only do the operation necessary.
	style:
		- styles can have any/all of the following.
		- whatever styles are present 
			- will be set on entering, reset back on leaving
			- others will be left alone
		page level:
			- header, footer, 
			- size, margins, border
			- columns, spacing, separator
		block level:
			- padding, margins, border - top, right, bottom, left (or tb lr)
		line level:
			- keep with next/prev
				- use for headers, drop caps, possibly orphan/widow
			- alignment: left, center, right, justify
			- tab stops? (also left/center/right justify)
		char level
			- font (number, 1-based index of fonts from init)
			- size [n Tf]
			- leading [n TL]
			- color 
				- [/name CS/cs n SCN/scn] for spots, 
				- [c m y k K/k] for cmyk, 
				- [n G/g] for gray, 
				- RG/rg for rgb (probably should never use)
			- character spacing [n Tc] (default n=0)
			- text rise (super, sub) [n Ts] (default n=0)
			- h-scaling? [n Tz] (default n=100)
			- rendering mode [n Tr] (default 0=fill, 1=stroke, 2=fill/stroke, 3=invisible, etc 9.3.6)
		
	questions:
		- how are we going to define "styles"? do we want to have some sort of style sheet format?


*/

module.exports = {
	add: (po, style)=> new objPageTool(po, style)
};


