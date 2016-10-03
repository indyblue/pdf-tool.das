var fno = function() {
	var t = this;
	t.debug = 0;
	t.steps = [];
	t.last = null;
	t.next = function(cb) {
		if(!Array.isArray(t.steps)) t.steps = [];
		if(arguments.length>0 && typeof cb === 'function') {
			if(t.debug) console.log(t.debug, 'promise: add new fn', t.steps.length);
			t.steps.push(cb);
		} else if(t.steps.length>0) {
			if(t.debug) console.log(t.debug, 'promise trigger fn', t.steps.length);
			var fn = t.steps.shift();
			if(typeof fn === 'function') fn();
		} else {
			t.finally();
		}
		return t;
	};
	t.trigger = () => { t.next(); };
	t.start = () => { t.next(); };
	t.finally = function(cb) {
		if(arguments.length==0
			&& typeof t.last === 'function') {
			if(t.debug) console.log(t.debug, 'promise trigger finally', typeof t.last);
			var fn = t.last;
			t.last = null;
			fn();
		} else if(typeof cb === 'function') {
			if(t.debug) console.log(t.debug, 'promise add finally', typeof t.last);
			t.last = cb;
		}
		return t;
	};
	t.reset = function() {
		t.steps = [];
		t.last = null;
	};
	return t;
};
module.exports = {
	new: () => new fno()
};
