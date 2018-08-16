var path = require('path');
var fs = require('fs');
var promise = require('promise.das');
var pdfTool = require('../index');
var style = pdfTool.style;

var pdf = pdfTool.new();
var pr = promise.new();

var dt0 = Date.now();

pr.next(() => {
	var fs = 10;
	var s = {
		default: style.qlegal({
			font: { size: fs, lead: fs * 9 / 8 },
			block: { align: 'j' },
			section: { columns: 2, spacing: 0.1 },
			page: {
				margin: [.3, .25, .25, .25],
				header: {
					suppress: [1],
					font: { fid: 1, size: 6, color: '0 1 1 0 k' },
					right: '{+inside}\t{+middle}\t[{#}]',
					left: '[{#}]\t{-middle}\t{-inside}'
				}
			}
		}),
		title: { section: { columns: 1 } },
		rubric: {
			font: { size: fs * .75, lead: fs * .75 * 9 / 8, color: '0 1 1 0 k' },
		},
		red: { font: { color: '0 1 1 0 k' } },
		nonrubric: { font: { fid: 1, color: '0 g' } },
		sup: { font: { rise: 0.4 * fs, size: 0.6 * fs } },
		drop: {
			block: {
				drop: { chars: 1, lead: 3 * fs, size: 3 * fs, color: '0 1 1 0 k' }
			}
		},
		head: {
			font: { size: 2 * fs, lead: 2 * fs, color: '0 1 1 0 k' },
			block: { align: 'c' },
			section: { columns: 1 }
		},
	};
	s.d = s.drop;
	s.r = s.rubric;
	s.nr = s.nonrubric;
	s.VR = s.vr;

	var lout = {
		book: 1,
		sig: 5,
		stack: 1
	};
	lout = 0; // comment this line to print q-legal booklet form!
	pdf.init({
		fonts: [
			'./node_modules/ttf-parse.das/_test/freeserif.ttf',
		],
		styles: s,
		layout: lout
	}, pr.trigger);
}).next(() => {
	var np = pdf.page;

	console.log('create new page', (Date.now() - dt0) / 1e3); dt0 = Date.now();

	var txt = "De­clí­na a ma­lo, et fac bo­num: * et in­há­bi­ta in sǽ­cu­lum sǽ­cu­li.";
	np.pushStyle('head');
	var x = np.parseLine('Psalmus', 2);
	np.popStyle();
	np.pushStyle('drop');
	var rnd = 65 + Math.random() * (91 - 65);
	//console.log(rnd);
	var rnd = 91;
	for (var i = 65; i < rnd; i++) {
		var x = np.parseLine(String.fromCharCode(i) + txt.repeat(10), 2);
	}
	np.popStyle();


	// */
	np.flushPage();
	np.endPage();
	pr.trigger();
}).next(() => {
	console.log('save', (Date.now() - dt0) / 1e3); dt0 = Date.now();
	pdf.save(path.join(__dirname, 'output.pdf')).then(pr.trigger);
}).finally(() => {
	console.log('done!', (Date.now() - dt0) / 1e3); dt0 = Date.now();
}).start();

