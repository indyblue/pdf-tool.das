function objPage(po, style) {
	var t = this;
	t.pdf = po;
	t.width = 4.25;
	t.height = 7;
	t.margin = 0.25;
	t.dpi = 72;
	t.stream = '';

	t.writePage = function(op, parRef, strRef) {
		op.add(op.omake(),
			' << /Type/Page',
			'  /Parent '+parRef+' 0 R',
			'  /Contents '+strRef+' 0 R',
			'  /MediaBox [0 0 '+(t.width*t.dpi)+' '+(t.height*t.dpi)+']',
			' >>','endobj');
	};
	t.writeStream = function() {
		return t.stream;
	};

	t.fid = 1;
	t.fsize = 12;
	t.flead = 14;
	t.color = '0 g'; // '0 1 1 0 k' for red
	t.align = 'j';
	var setprop = function(key, val) {
		//console.log(t[key], key, val);
		if(typeof val != 'undefined' && val!=null)
			t[key] = val;
		//console.log(t[key], key, val);
	};
	t.setStyle = function(fid, fsize, flead, color, align) {
		setprop('fid', fid);
		setprop('fsize', fsize);
		var rxlead = /^(\d+)%$/;
		if(rxlead.test(flead)) {
			var lead = rxlead.exec(flead)[1] / 100;
			var font = t.pdf.fonts[t.fid-1];
			flead = t.fsize * lead * font.metric.capheight / font.metric.unitsPerEm;
			//console.log(t.fsize, lead, font.metric.capheight , font.metric.unitsPerEm, flead);
		}
		setprop('flead', flead);
		setprop('color', color);
		setprop('align', align);
		t.cl += '] TJ '+t.style()+' [';
	};
	t.style = () => ' /F'+t.fid+' '+t.fsize+' Tf '+t.flead+' TL '+t.color+' ';
	
	var q = {};
	q.x0 = t.margin * t.dpi;
	q.y0 = (t.height-t.margin) * t.dpi;
	q.x = q.x0;
	q.y = q.y0;
	q.ym = q.x0;
	q.xm = (t.width - t.margin) * t.dpi;
	var line = new objLine(t);
	t.box = function() {
		return ' '+q.x0+' '+q.x0+' '
			+((t.width-2*t.margin)*t.dpi)+' '
			+((t.height-2*t.margin)*t.dpi)+' re s ';
	};
	t.startText = function() {
		t.stream += '\n BT '+t.style()+' '+q.x0+' '+q.y0+' Td ';
	};
	t.endText = function() {
		t.nl();
		t.stream += ' ET';
	};
	t.cl = '';
	q.ptl = '';
	q.spaces = function(txt, adj) {
		var matches = txt.match(/s0s/g);
		var len = 0;
		if(Array.isArray(matches)) 
			len = matches.length;
		if(typeof adj == 'undefined')
			return len;
		else 
			return adj/len;
	};
	t.nl = function(isAuto) {
		if(typeof isAuto=='undefined') isAuto = false;

		var adj = 0;
		var open = ' 0 -'+t.flead+' TD [ ';
		if(t.align=='j' && isAuto) {
			//var  num = q.spaces(t.cl);
			adj = -round((q.xm - q.x) * 1000 /t.fsize, 2);
			adj = q.spaces(t.cl, adj);
			if(adj<-1000) adj=0;
		} else if(t.align=='c') {
			cadj = -round((q.xm - q.x) * 1000 / 2, 2);
			open = ' 0 -'+t.flead+' TD /F'+t.fid+' 1 Tf ['+cadj+'] TJ /F'+t.fid+' '+t.fsize+' Tf [ ';
			//console.log(q.x, q.xm, (q.xm-q.x)/2, cadj, open);
			//open = '['+cadj;
		}
		t.cl = t.cl.replace(/s0s/g, adj);

		q.y -= t.flead;
		if(q.y<q.ym) {
			//*
			var newp = null;
			if(t!=po.cp) newp = po.cp;
			else {
				newp = po.newPage(po, null);
				newp.startText();
			}
			newp.setStyle(q.fid, q.fsize, q.flead, q.color, q.align);
			console.log(q.y, q.ym, q.y0, po.pages.length, q.ptl);
			newp.cl = t.cl;
			newp.nl();
			t.stream += ' ET';
			// */
		} else {
			//console.log(q.ptl);
			t.stream += '\n% '+q.ptl +'\n';
			t.stream += open + t.cl + '] TJ \n';
		}
		t.cl = '';
		q.ptl = '';
		q.x = q.x0;
		//t.addText(Math.round(q.y) + ' '+q.y0+'/'+q.ym+' ');
	};
	t.addText = function(txt, isBlock) {
		var sp = line.parseWord(' ');
		var awords = txt.split(/\s+/);
		for(var i=0;i<awords.length;i++){
			var aw = line.parseWord(awords[i]);
			if(q.x+sp[0]+aw[0]>q.xm) t.nl(true);
			if(q.x>q.x0) {
				t.cl += sp[1] + ' s0s ';
				q.ptl += sp[2];
				q.x += sp[0];
			}
			//console.log(aw);
			t.cl += aw[1];
			q.ptl += aw[2];
			q.x += aw[0];
		};
		if(isBlock) t.nl();
	};

	po.pages.push(t);
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

function objLine(pg) {
 /*
 	a line consists of an array of word objects, which consist of:
		[ word-width, is-space, word-text, word-u16-text]
	rules:
		if a BT is needed, it should be included in the first character.
		TJ blocks...all spaces should be open-ended TJ blocks, so that space adjustments can be made
 */
	var t = this;
	t.page = pg;

	t.parseWord = function(word) {
		var width = 0;
		var txt = ' (';
		for(var i=0;i<word.length;i++){
			var aw = t.chrWidth(word[i], word[i+1]);
			width += (aw[0] + aw[1]) * aw[2];
			//console.log('aw',aw);
			var ule = new Buffer(word[i], 'utf16le');
			var ube = Buffer.alloc(ule.length);
			for(var j=0;j<ule.length;j++){
				ube[j] = ule[ule.length-j-1];
			}
			txt += ube.toString('binary');
			if(aw[1]!=0) txt+= ')'+(0-aw[1])+'(';
		}
		txt += ') ';
		return [width, txt, word];
	};

	t.chrWidth = function(chr, chr1) {
		var code = chr.charCodeAt();
		var code1 = 0;
		if(typeof chr1 != 'undefined') code1 = chr1.charCodeAt();
		var font = pg.pdf.fonts[pg.fid-1];
		var factor = pg.fsize /1000.; //font.metric.capheight / font.metric.unitsPerEm;
		//console.log(pg.fsize, font.metric.capheight, font.metric.unitsPerEm);
		var chrw = font.cw[code];
		if(typeof chrw == 'undefined') chrw = font.metric.missingWidth;
		var chrk = 0;
		if(typeof font.kern != 'undefined'
			&& typeof font.kern[code] != 'undefined'
			&& typeof font.kern[code][code1] != 'undefined')
			chrk = font.kern[code][code1];
		return [chrw, chrk, factor];
	};
	
}

module.exports = {
	add: (po, style)=> new objPage(po, style)
};

function round(x, n) {
	var f = Math.pow(10,n)
	var r = x*f;
	var r2 = Math.round(r);
	var r3 = r2/f;
	return r3;
}
