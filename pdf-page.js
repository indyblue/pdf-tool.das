function objPage(po, opt) {
	var t = this;
	t.pdf = po;
	t.width = 4.25;
	t.height = 7;
	t.margin = 0.25;
	t.dpi = 72;
	t.stream = '';
	po.pages.push(t);

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

	t.blocks = [];
	t.lines = [];
	t.words = [];
	t.addWord = function(word) {
		
	};
	
	return t;
}

module.exports = {
	add: objPage
};
