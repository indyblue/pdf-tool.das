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
	new: () => new fno(),
	extend: fnExtend,
	round: fnRound,
	getValue: fnGetValue
};

function fnExtend(){
	var retval = {};
	if(arguments.length>0) retval = arguments[0];
	for(var i=1;i<arguments.length;i++){
		var arg = arguments[i];
		if(typeof arg!='object') continue;
		var argKeys = Object.keys(arg);
		for(var j=0;j<argKeys.length;j++){
			var key = argKeys[j];
			var val = arg[key];
			var descr = Object.getOwnPropertyDescriptor(arg,key);
			// allow getter/setter to be inherited
			if(typeof descr.get!='undefined' || typeof descr.set!='undefined'){
				var val = {enumerable:true,configurable:true};
				if(typeof descr.get!='undefined') val.get = descr.get;
				if(typeof descr.set!='undefined') val.set = descr.set;
				// don't inherit if there is already a getter/setter
				var retDescr = Object.getOwnPropertyDescriptor(retval,key);
				if(typeof retDescr.get=='undefined' && typeof retDescr.set=='undefined')
					Object.defineProperty(retval, key, val);
			} // recurse for objects (but not arrays)
			else if(typeof val == 'object' && !Array.isArray(val)) {
				if(typeof retval[key]=='undefined') retval[key] = {};
				if(typeof retval[key]!='object') retval[key] = { value: retval[key] };
				fnExtend(retval[key], val);
			} // for arrays, make a copy of the whole array and use it 
			else if(Array.isArray(val)) {
				retval[key] = fnExtend([], val);
			} else retval[key] = val;
		}
	}
	return retval;
}


function fnRound(x, n) {
	var f = Math.pow(10,n)
	var r = x*f;
	var r2 = Math.round(r);
	var r3 = r2/f;
	return r3;
}

function fnGetValue(obj, key, def) {
	if(typeof obj!=='object') return def;
	if(typeof obj[key]!== 'undefined')
		return obj[key];
	else return def;

}

