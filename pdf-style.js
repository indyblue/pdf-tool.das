var promise = require('./promise.js');
var round = promise.round;
var getValue = promise.getValue;
var extend = promise.extend;


function fnStyleDefault(obj) {
	var ppi = 72;
	var ppc = round(72/2.54,2);
	var ppm = round(72/25.4,2);
	var font = {
		fid: 1,
		size: 12,
		lead: 14,
		color: '0 g', // '0 1 1 0 k' for red
		spacing:0,
		rise:0
	};
	var block = {
		align: 'j', // left, right, center, justify
		get isDrop() { return typeof this.drop == 'object' 
								&& this.drop != null
								&& typeof this.drop.chars == 'number'
								&& this.drop.chars>0; },
		//drop: { chars: 1, fid: 1, lines: 2, color: '0 1 1 0 k' }, 
		keepWithNext: false,
		keepWithPrev: false,
		keepTogether: false,
		margin: [0,0,0,0], // top, right, bottom, left
		firstLineIndent: 0,
		_tabs: [
			{ position: 0, align: 'l' },
			{ position: 'this.xw/2', align: 'c' },
			{ position: 'this.xw', align: 'r' }
		],
		get xw() { return section.xw; },
		get tabs() {
			var ret = extend([],this._tabs);
			var hasRR = false;
			for(var i=ret.length-1;i>=0;i--){
				var t = ret[i];
				if(typeof t.align=='undefined') t.align='l';
				var val = 0;
				try{ val = eval(t.position); }
				catch(e) {}
				t.position = val;
				if(t.position>this.xw) {
					if(!hasRR && t.align=='r') {
						t.position=this.xw;
						hasRR=true;
					}
					else ret.splice(i,1);
				}
			}
			return ret;
		}
	};
	var section = {
		columns: 1,
		spacing: 0.25,
		divider: '', // somehow we want to indicate color, width and style?
		pText: [], // do we indicate parallel languages here?
		get xw() { 
			var spaceAll = (this.columns-1)*this.sp;
			var colWidth = (page.xw - spaceAll) / this.columns;
			return colWidth;
		},
		get sp() { return this.spacing*page.pointsPerUnit; },
		get colShift() { return this.xw + this.sp; }
	};
	var page = {
		width: 8.5,
		height: 11,
		margin: 0.75,
		gutter: 0,
		num: 1,
		header:'',
		footer:'',
		
		getMargin(pos) { // pos 1-top, 2-right, 3-bottom, 4-left
			if(typeof pos=='string'){
				if(/^t$/i.test(pos)) pos = 1;
				else if(/^r$/i.test(pos)) pos = 2;
				else if(/^b$/i.test(pos)) pos = 3;
				else if(/^l$/i.test(pos)) pos = 4;
			}
			var margin = this.margin;
			// gutter left/right
			var gl = (this.num%2)*this.gutter;
			var gr = (1-this.num%2)*this.gutter;
			
			var ret = 0;
			if(typeof margin=='number') ret = margin;
			else if(Array.isArray(margin)) {
				if(margin.length==1) ret = margin[0];
				else if(margin.length==2) {
					if(pos%2==1) ret = margin[0];
					else ret = margin[1];
				} 
				else ret = getValue(margin, pos-1, 0);
			}
			if(pos==4) ret += gl;
			else if(pos==2) ret += gr;
			return ret;
		},

		get ptwidth() { return this.width * this.pointsPerUnit; },
		get ptheight() { return this.height * this.pointsPerUnit; },
		get x0() { return this.getMargin(4) * this.pointsPerUnit; },
		get xmax() { return (this.width - this.getMargin(2)) * this.pointsPerUnit; },
		get xw() { return this.xmax - this.x0; },
		get y0() { return (this.height - this.getMargin(1)) * this.pointsPerUnit; },
		get ymin() { return this.getMargin(3) * this.pointsPerUnit; },
		get yh() { return this.y0 - this.ymin; },
		pointsPerUnit: 72,
		set units(v) { // options: in, cm, mm, pt
			if(/^cm$/i.test(v)) this.pointsPerUnit = ppc;
			else if(/^mm$/i.test(v)) this.pointsPerUnit = ppm;
			else if(/^pt$/i.test(v)) this.pointsPerUnit = 1;
			else this.pointsPerUnit = ppi;
		},
		get units() {
			switch(this.pointsPerUnit){
				case ppc: return 'cm';
				case ppm: return 'mm';
				case 1: return 'pt';
				default: return 'in';
			}
		}
	};
	var style = {
		font: font,
		block: block,
		section: section,
		page: page
	};
	extend(style, obj);
	return style;
}

var defQlegal = {
	font: { size: 8, lead: 9 },
	section: { 
		columns: 2 
	},
	block: {
		align: 'j', // left, right, center, justify
		_tabs: [
			{ position: 0, align: 'l' },
			{ position: 'this.xw', align: 'r' }
		]
	},
	page: {
		width: 4.25,
		height: 7,
		margin: .25,
		gutter: 0.1,
		num: 1,
		numPrefix: 'P',
		numSuffix: '*'
	}
};

module.exports = {
	letter: (o) => new fnStyleDefault(o),
	qlegal: (o) => extend(new fnStyleDefault(), defQlegal, o)
};
