"define metadata";
({
	"description": "Highlights matching brackets",
	"dependencies": { "standard_syntax": "0.0.0", "jquery": "0.0.0", "rangeutils": "0.0.0", "environment": "0.0.0", "events": "0.0.0", "color_injector": "0.0.0" },
	"provides": [
		{
			"ep": "extensionpoint",
			"name": "match_brackets",
			"description": "Match some brackets, mkay?"
		},
		{
			"ep": "command",
			"name": "matchbrackets",
			"params": [
				{
					"name": "enable",
					"type": "text",
					"description": "Enable or disable bracket matching",
					"defaultValue": "true"
				}
			],
			"description": "Highlight matching brackets",
			"pointer": "#toggle"
		},
		{
			"ep": "setting",
			"name": "matchBrackets",
			"description": "Highlight matching opening/closing brackets when selected",
			"type": "text",
			"defaultValue": "true",
			"pointer": "#toggle",
			"register": "#toggle"
		}
	]
});
"end";

/*
ISSUES:

	1.	The "matchbrackets" command doesn't get saved in the
		command history for some reason.

	2.	The "provides": "setting" object doesn't fully work.
		The description shows up in the command line, but
		the pointer is only triggered after this plugin
		gets loaded (which won't happen until the user
		enters the "matchbrackets" command in the command line).
*/

var console = require('bespin:console').console;
var rangeUtils = require('rangeutils:utils/range');
var util = require('bespin:util/util');
var env = require('environment').env;
var Event = require('events').Event;
var $ = require('jquery').$;

var catalog = require('bespin:plugins').catalog;
var settings = require('settings').settings;

var ColorInjector = require('color_injector').ColorInjector;

exports.Matcher = function(editor) {
	this.editor = editor || env.editor;
	this.editor.selectionChanged.add(this, this.selectionChanged.bind(this));
	
	this.injector = new ColorInjector(this.editor, 'match_brackets');
	
	// FIXME: this registers the matcher every time it is initialized, but there
	// doesn't seem to be any way to UN-register it on cleanup, so it ends up geting
	// registered multiple times if the user enables bracket matching more than once.
	catalog.registerExtension('settingChange', {
		match: "match[Pairs|Brackets]",
		pointer: function() { console.log('settingChange: ', arguments); }.bind(this)
	});
}

exports.Matcher.prototype = {
	
	// Print debugging info to the console?
	DEBUG: false,
	
	// Call console.profile() to measure execution time?
	PROFILE: false,
	
	// List of matching character pairs
	pairs: [
		{ open: '(', close: ')' },
		{ open: '[', close: ']' },
		{ open: '{', close: '}' },
		{ open: '<', close: '>' }
	],
	
	// Syntax highlighter tags to ignore
	_ignoreRegex: /^(string|comment)$/i,
	
	cleanup: function() {
		this.injector.cleanAll();
		this.editor.selectionChanged.remove(this);
	},
	
	// Event handler that gets called when the user changes the selection in the editor
	selectionChanged: function(range) {
		// Remove any existing highlights from previous matches
		this.injector.cleanAll();
		
		// Make a deep clone of the range so we can manipulate it without affecting other plugins
		range = rangeUtils.normalizeRange($.extend(true, {}, range));

		// 0 characters selected (cursor/insertion point placed)
		if(rangeUtils.isZeroLength(range)) {
			// Extend end col by 1 (pretend that the user selected 1 character)
			range.end.col += 1;
		}
		
		// Abort if character is escaped with a backslash (\) or is inside a string or comment
		if(this.ignoreChar(range)) {
			return;
		}
		
		// Exactly 1 character selected
		if(Math.abs(range.start.col - range.end.col) === 1 && range.start.row === range.end.row) {
			if(this.PROFILE) console.profile();
			
			this.findMatch(range);
			
			if(this.PROFILE) console.profileEnd();
		}
	},
	
	// Get the matching character pair object associated with the given character
	getPair: function(char) {
		var len = this.pairs.length;
		
		// Loop through all character pairs
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
	
	// Generate a data object for the given cursor range
	getDataObject: function(cursorRange) {
		var char = this.editor.getText(cursorRange);
		var pair = this.getPair(char);
		
		if(pair) {
			var lines = this.editor.layoutManager.textStorage.getLines();
			
			var row = cursorRange.start.row;
			var col = cursorRange.start.col + pair.direction;
			
			// If the user placed their cursor at the begging of a line (col == 0) and pair.direction is -1,
			// col will be -1. Move to the next row (line) since there's nothing left to search on this one.
			if(col === -1) {
				row += pair.direction;
			}
			
			// Initialize the sum to -1. Matching chars will add +1, selected chars will add -1.
			var sum = -1;
			
			// Container object to allow other functions to access and modify these properties
			var data = {
				lines: lines,
				line: null,
				pair: pair,
				row: row,
				col: col,
				sum: sum
			};
			
			return data;
		}
	},
	
	findMatch: function(cursorRange) {
		var data = this.getDataObject(cursorRange);
		
		if(data) {
			// Load the appropriate search strategy based on what direction we need to search (forward or backward)
			var searchStrategy = this.searchStrategies[data.pair.direction];
			
			// Iterate over each line until the sum reaches zero or we've reached the beginning or end of the file
			for( ; data.sum !== 0 && data.row >= 0 && data.row < data.lines.length; data.row += data.pair.direction) {
				data.line = data.lines[data.row];
				
				// If col is -1, reset it to either 0 (beginning of the line) or line.length (end of the line)
				if(data.col === -1) {
					data.col = (data.pair.direction > 0 ? 0 : data.line.length);
				}
				
				// Continue searching this line until we find a matching char (sum == 0) or we run out of characters
				while(data.sum !== 0 && data.col > -1) {
					searchStrategy.next.call(this, data);
				}
			}
			
			// We found a match!
			if(data.sum === 0) {
				// The for() loop's incrementer gets a little carried away - offset that by subtracting the last amount added by the for() loop from the row count.
				data.row -= data.pair.direction;
				
				// Log it
				this._log('Found: row=', data.row, ', col=', data.col);
				
				// Highlight the matching braces/parentheses/whatever
				this.highlightPair(cursorRange, data);
			}
			// Better luck next time
			else {
				this._log('Not found!');
			}
		}
	},
	
	searchStrategies: {
		// Forward: --->
		'1': {
			next: function(data) {
				var selectedIndex = data.line.indexOf(data.pair.selected, data.col);
				var matchingIndex = data.line.indexOf(data.pair.matching, data.col);
				
				// Neither character is present in the current line
				if(matchingIndex === -1 && selectedIndex === -1) {
					data.col = -1;
				}
				// Matching char exists and is CLOSER THAN (before) the selected char
				else if(matchingIndex > -1 && (matchingIndex < selectedIndex || selectedIndex === -1)) {
					var range = this.getCharRange(data, matchingIndex);
					
					if(!this.ignoreChar(range)) {
						data.sum += 1;
					}
					
					data.col = matchingIndex + 1;
				}
				// Matching char does not exist or is AFTER selected char
				else {
					var range = this.getCharRange(data, selectedIndex);
					
					if(!this.ignoreChar(range)) {
						data.sum -= 1;
					}
					
					data.col = selectedIndex + 1;
				}
			}
		},
		
		// Backward: <---
		'-1': {
			next: function(data) {
				var selectedIndex = data.line.lastIndexOf(data.pair.selected, data.col);
				var matchingIndex = data.line.lastIndexOf(data.pair.matching, data.col);
				
				// Neither character is present in the current line
				if(matchingIndex === -1 && selectedIndex === -1) {
					data.col = -1;
				}
				// Matching char is CLOSER THAN (after) the selected char
				else if(matchingIndex > selectedIndex) {
					var range = this.getCharRange(data, matchingIndex);
					
					if(!this.ignoreChar(range)) {
						data.sum += 1;
					}
					
					data.col = matchingIndex - 1;
				}
				// Matching char does not exist or is AFTER selected char
				else {
					var range = this.getCharRange(data, selectedIndex);
					
					if(!this.ignoreChar(range)) {
						data.sum -= 1;
					}
					
					data.col = selectedIndex - 1;
				}
			}
		}
	},
	
	getCharRange: function(data, index) {
		return { start: { row: data.row, col: index     },
			     end:   { row: data.row, col: index + 1 } };
	},
	
	// Should we ignore the character at the selected range (e.g., if it is inside a comment or string)?
	ignoreChar: function(range) {
		// Clone the text range and shift it 1 character to the left
		var rangeBefore = $.extend(true, {}, range);
			rangeBefore.start.col -= 1;
			rangeBefore.end.col -= 1;
		
		// Get the character before (to the left of) the user's selection
		var charBefore = this.editor.getText(rangeBefore);
		var curCharColor = this.injector.getColorAt(range.start);
		
		// Range has been tagged by the syntax highlighter as a comment or a string
		var isCommentOrString = curCharColor && this._ignoreRegex.test(curCharColor.tag);
		
		return charBefore === '\\' || isCommentOrString;
	},
	
	highlightPair: function(cursorRange, data) {
		var selectedRow = cursorRange.start.row;
		var selectedColor = {
			start: cursorRange.start.col,
			end: cursorRange.end.col,
			state: [],
			tag: 'addition'
		};
		
		var matchingRow = data.row;
		var matchingColor = {
			start: data.col - data.pair.direction,
			end: data.col - data.pair.direction + 1,
			state: [],
			tag: 'addition'
		};
		
		var sameRow = selectedRow === matchingRow;
		var adjacentCols = Math.abs(selectedColor.end - matchingColor.start) === 0 || Math.abs(selectedColor.start - matchingColor.end) === 0;
		
		// Chars are next to each other; combine the two separate highlights into a single color object
		if(sameRow && adjacentCols) {
			if(data.pair.direction > 0) {
				selectedColor.end += 1;
			} else {
				selectedColor.start -= 1;
			}
		}
		// Highlight each char separately
		else {
			this.injector.inject(matchingRow, matchingColor);
		}
		
		this.injector.inject(selectedRow, selectedColor);
	},
	
	// Alias
	_displacePosition: function() {
		var textStorage = this.editor.layoutManager.textStorage;
		return textStorage.displacePosition.apply(textStorage, arguments);
	},
	
	_log: function() {
		if(this.DEBUG) {
			console.log.apply(this, arguments);
		}
	}
	
};

exports.init = function() {
	if(!exports.instance) {
		exports.instance = window.matcher = new exports.Matcher(env.editor);
	}
	exports.instance.selectionChanged(env.editor.selection);
};

exports.cleanup = function() {
	if(exports.instance) {
		exports.instance.cleanup();
	}
	exports.instance = window.matcher = null;
};

exports.toggle = function(valueObj, commandObj) {
	console.log('match_brackets.exports.toggle(', arguments, ')');
	
	// Explicitly enable bracket matching
	if(/^(true|yes|on|enable|match)$/i.test(valueObj.enable)) {
		exports.init();
	}
	// Explicitly disable bracket matching
	else if(/^(false|no|off|disable|no[-_]?match)$/i.test(valueObj.enable)) {
		exports.cleanup();
	}
};