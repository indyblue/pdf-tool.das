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
	};
	var block = {};
	var section = {
		columns: 1,
		spacing: 0.25,
		divider: '', // somehow we want to indicate color, width and style?
		pText: [] // do we indicate parallel languages here?
	};
	var page = {
		width: 8.5,
		height: 11,
		margin: 0.75,
		gutter: 0,
		num: 1,
		numPrefix: '',
		numSuffix: '',
		
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

		get x0() { return this.getMargin(4) * this.pointsPerUnit; },
		get xmax() { return (this.width - this.getMargin(2)) * this.pointsPerUnit; },
		get y0() { return (this.height - this.getMargin(1)) * this.pointsPerUnit; },
		get ymin() { return this.getMargin(3) * this.pointsPerUnit; },
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

var defBrev = {
	font: { size: 8, lead: 9 },
	section: { columns: 2, 

module.exports = {
	default: (o) => new fnStyleDefault(o),
	brev: (o) => extend(new fnStyleDefault, defBrev, o)
};
