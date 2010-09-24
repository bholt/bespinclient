"define metadata";
({
	"description": "Highlights matching pairs of characters",
	"dependencies": { "standard_syntax": "0.0.0", "jquery": "0.0.0" },
	"provides": [
		{
			"ep": "extensionpoint",
			"name": "match_pairs",
			"description": "Matches some pairs, mkay?"
		}
	]
});
"end";

var console = require('bespin:console').console;
var rangeUtils = require('rangeutils:utils/range');
var util = require('bespin:util/util');
var env = require('environment').env;
var $ = require('jquery').$;

var ColorInjector = require('color_injector').ColorInjector;

exports.Matcher = function(editor) {
	this.editor = editor || env.editor;
	
	this.editor.selectionChanged.add('match_pairs', this.selectionChanged.bind(this));
	
	this.injector = new ColorInjector(this.editor, 'match_pair');
}

exports.Matcher.prototype = {
	
	DEBUG: false,
	
	pairs: [
		{ open: '(', close: ')' },
		{ open: '[', close: ']' },
		{ open: '{', close: '}' },
		{ open: '<', close: '>' }
	],
	
	selectionChanged: function(range) {
		this.injector.cleanAll();
		
		// Make a deep clone so we can manipulate it without affecting other plugins
		range = rangeUtils.normalizeRange($.extend(true, {}, range));

		// 0 characters selected (cursor/insertion point placed)
		if(rangeUtils.isZeroLength(range)) {
			// Extend end col by 1 (pretend that the user selected 1 character)
			range.end.col += 1;
		}
		
		// Clone the text range and shift it 1 character to the left
		var rangeBefore = $.extend(true, {}, range);
		rangeBefore.start.col -= 1;
		rangeBefore.end.col -= 1;
		
		// Get the character before (to the left of) the user's selecetion
		var charBefore = this.editor.getText(rangeBefore);
		
		// Abort if character is escaped with a backslash (\)
		if(charBefore === '\\') {
			return;
		}
		
		// 1 character selected
		if(Math.abs(range.start.col - range.end.col) === 1) {
			this.findMatch(range);
		}
	},
	
	findMatch: function(cursorRange) {
		var char = this.editor.getText(cursorRange);
		var pair = this.getPair(char);
		
		if(pair) {
			var searchStrategy = this.searchStrategies[pair.direction];
			
			var entireRange = this.editor.layoutManager.textStorage.getRange();
			var searchRange = searchStrategy.getSearchRange(cursorRange, entireRange);
			
			var data = {
				text: this.editor.getText(searchRange),
				pair: pair,
				distance: 0
			}
			
			var sum = -1;
			var index = 0;
			
			while(sum !== 0 && index > -1 && data.text.length > 0) {
				var nextCharPos = searchStrategy.getNextCharPos.call(this, data);

				sum += nextCharPos.score;
				index = nextCharPos.index;
			}
			
			if(sum === 0 && index > -1) {
				this.highlightPair(cursorRange, data.distance);
				this._log('Found: index = ', index, ', distance = ', data.distance);
			} else {
				this._log('Not found!  sum = ', sum, ', index = ', index, ', distance = ', data.distance);
			}
		}
	},
	
	getPair: function(char) {
		var len = this.pairs.length;
		
		for(var i = 0; i < len; i++) {
			var pair = this.pairs[i];

			// Opening character
			if(pair.open === char) {
				return {
					selected: pair.open,
					matching: pair.close,
					direction: +1
				};
			}
			// Closing character
			else if(pair.close === char) {
				return {
					selected: pair.close,
					matching: pair.open,
					direction: -1
				};
			}
		}
		
		return;
	},
	
	searchStrategies: {
		'-1': {
			getSearchRange: function(cursorRange, entireRange) {
				return { start: entireRange.start, end: { row: cursorRange.end.row, col: cursorRange.end.col - 1 } };
			},
			getNextCharPos: function(data) {
				var nextMatchingIndex = data.text.lastIndexOf(data.pair.matching);
				var nextSelectedIndex = data.text.lastIndexOf(data.pair.selected);

				data.distance == data.distance || 0;

				this._log('-1: text.length = ', data.text.length, ', nextMatchingIndex = ', nextMatchingIndex, ', nextSelectedIndex = ', nextSelectedIndex);

				if(nextMatchingIndex > nextSelectedIndex || nextSelectedIndex === -1) {
					var index = nextMatchingIndex;

					data.distance -= Math.abs(data.text.length - index);
					data.text = data.text.substring(0, index);

					return { score: +1, index: index };
				}
				else {
					var index = nextSelectedIndex;

					data.distance -= Math.abs(data.text.length - index);
					data.text = data.text.substring(0, index);

					return { score: -1, index: index };
				}
			}
		},
		'1': {
			getSearchRange: function(cursorRange, entireRange) {
				return { start: { row: cursorRange.start.row, col: cursorRange.start.col + 1 }, end: entireRange.end };
			},
			getNextCharPos: function(data) {
				var nextMatchingIndex = data.text.indexOf(data.pair.matching);
				var nextSelectedIndex = data.text.indexOf(data.pair.selected);

				data.distance == data.distance || +1;

				this._log('+1: text.length = ', data.text.length, ', nextMatchingIndex = ', nextMatchingIndex, ', nextSelectedIndex = ', nextSelectedIndex);

				if(nextMatchingIndex < nextSelectedIndex || nextSelectedIndex === -1) {
					var index = nextMatchingIndex;

					data.distance += (index + 1);
					data.text = data.text.substring(index + 1);

					return { score: +1, index: index };
				}
				else {
					var index = nextSelectedIndex;

					data.distance += (index + 1);
					data.text = data.text.substring(index + 1);

					return { score: -1, index: index };
				}
			}
		}
	},

	highlightPair: function(cursorRange, distance) {
		var match = {
			start: $.extend(true, {}, cursorRange.start),
			end: undefined
		};
		
		match.start = this.editor.layoutManager.textStorage.displacePosition(match.start, distance);
		match.end = $.extend(true, {}, match.start);
		match.end.col += 1;
		
		var matchColor = {
			start: match.start.col,
			end: match.end.col,
			state: [],
			tag: 'addition'
		};
		
		var selectedColor = $.extend(true, {}, matchColor);
		
		selectedColor.start = cursorRange.start.col;
		selectedColor.end = cursorRange.end.col;
		
		this.injector.inject(cursorRange.start.row, selectedColor);
		this.injector.inject(match.start.row, matchColor);
	},
	
	_log: function() {
		if(this.DEBUG) {
			console.log.apply(this, arguments);
		}
	}
	
};

exports.instance = window.matcher = new exports.Matcher(env.editor);