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
					"defaultValue": null
				}
			],
			"description": "Highlight matching brackets",
			"pointer": "#cmdSetEnabled"
		},
		{
			"ep": "command",
			"name": "jumpToMatchingBracket",
			"description": "Jump to the location of the matching bracket",
			"key": "ctrl_shift_m",
			"pointer": "#cmdJumpToMatching",
			"predicates": { "isTextView": true }
		},
		{
			"ep": "setting",
			"name": "matchBrackets",
			"description": "Highlight matching opening/closing brackets when selected",
			"type": "text",
			"defaultValue": "true",
			"pointer": "#cmdSetEnabled",
			"register": "#cmdSetEnabled"
		}
	]
});
"end";

/*
HOW TO USE:

	1.	Copy this plugin to the /bespinclient/plugins/thirdparty directory
	
	2.	Enable or disable this plugin using the following command in the Bespin command line:
			{}> matchbrackets [true|false|on|off]
	
	3.	Move the cursor to the matching bracket by pressing the following keys simultaneously:
			CTRL + SHIFT + M (Windows)
			COMMAND + SHIFT + M (Mac)

ISSUES:

	1.	The "provides": "setting" object doesn't fully work.
		The description shows up in the command line, but
		the pointer is only triggered after this plugin
		gets loaded (which won't happen until the user
		enters the "matchbrackets" command in the command line).
	
	2.	Bracket matching is not filetype-aware; '<' and '>' should
		be matched in HTML documents but not in scripts.
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
	
	// Create a new Color Injector to do the highlighting
	this.injector = new ColorInjector(this.editor, 'match_brackets');
	
	// Bind event handler for text selection
	this.editor.selectionChanged.add(this, this.selectionChanged.bind(this));
	
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
	
	// 
	_enabled: false,
	
	// Syntax highlighter tags to ignore
	_ignoreRegex: /^(string|comment)$/i,
	
	// Current selected/matching pair positions
	_curPair: null,
	
	// Remove highlights and remove this object from the editor's selectionChanged event handlers
	cleanup: function() {
		this._curPair = null;
		this.injector.cleanAll();
		this.editor.selectionChanged.remove(this);
	},
	
	// Event handler that gets called when the user changes the selection in the editor
	selectionChanged: function(cursorRange) {
		// Start performance profiling
		this._profile();
		
		this._curPair = null;
		
		// Remove any existing highlights from previous matches
		this.injector.cleanAll();
		
		// Ignore bogus cursor ranges and skip matching if disabled
		if(!cursorRange || !rangeUtils.isRange(cursorRange) || !this.enabled) {
			return;
		}
		
		// Take the end position of the cursor range and create a new 1-character range from it
		var charRange = {
			start: {
				row: cursorRange.end.row,
				col: cursorRange.end.col - 1
			},
			end: {
				row: cursorRange.end.row,
				col: cursorRange.end.col
			}
		};
		
		// Abort if character is escaped with a backslash (\) or is inside a string or comment
		if(this.ignoreChar(charRange)) {
			return;
		}
		
		this.findMatch(charRange);
		
		// Stop performance profiling
		this._profileEnd();
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
	getDataObject: function(charRange) {
		var char = this.editor.getText(charRange);
		var pair = this.getPair(char);
		
		// If cursor range is not a pair character, try the character after it
		if(!pair) {
			charRange.start.col += 1;
			charRange.end.col += 1;
			
			char = this.editor.getText(charRange);
			pair = this.getPair(char);
		}
		
		if(pair) {
			var lines = this.editor.layoutManager.textStorage.getLines();
			
			var row = charRange.start.row;
			var col = charRange.start.col + pair.direction;
			
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
	
	findMatch: function(charRange) {
		var data = this.getDataObject(charRange);
		
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
				this.highlightPair(charRange, data);
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
		var rangeBefore = {
			start: {
				row: range.start.row,
				col: range.start.col - 1
			},
			end: {
				row: range.end.row,
				col: range.end.col - 1
			}
		};
		
		// Get the character before (to the left of) the user's selection
		var charBefore = this.editor.getText(rangeBefore);
		var curCharColor = this.injector.getColorAt(range.start);
		
		// Range has been tagged by the syntax highlighter as a comment or a string
		var isCommentOrString = curCharColor && this._ignoreRegex.test(curCharColor.tag);
		
		return charBefore === '\\' || isCommentOrString;
	},
	
	highlightPair: function(charRange, data) {
		var selectedRow = charRange.start.row;
		var selectedColor = {
			start: charRange.start.col,
			end: charRange.end.col,
			state: [],
			tag: 'bracket_selected'
		};
		
		var matchingRow = data.row;
		var matchingColor = {
			start: data.col - data.pair.direction,
			end: data.col - data.pair.direction + 1,
			state: [],
			tag: 'bracket_matching'
		};
		
		this._curPair = {
			selected: { row: selectedRow, col: selectedColor.end },
			matching: { row: matchingRow, col: matchingColor.end }
		};
		
		this.injector.inject(matchingRow, matchingColor);
		this.injector.inject(selectedRow, selectedColor);
	},
	
	jumpToMatching: function() {
		if(this.enabled && this._curPair) {
			this.editor.setCursor(this._curPair.matching);
		}
	},
	
	_log: function() {
		if(this.DEBUG) {
			console.log.apply(this, arguments);
		}
	},
	
	_profile: function() {
		if(this.PROFILE) {
			console.profile();
		}
	},
	
	_profileEnd: function() {
		if(this.PROFILE) {
			console.profileEnd();
		}
	}
	
};

Object.defineProperties(exports.Matcher.prototype, {
	enabled: {
		set: function(enable) {
			// Turn on highlighting
			if(enable) {
				this._enabled = true;
			}
			// Turn off highlighting
			else {
				this._enabled = false;
			}
			
			this.selectionChanged(null);
		},

		get: function() {
			return this._enabled;
		}
	}
});

exports.init = function() {
	if(!exports.instance) {
		exports.instance = window.matcher = new exports.Matcher(env.editor);
		exports.instance.selectionChanged(env.editor.selection);
	}
};

exports.cleanup = function() {
	if(exports.instance) {
		exports.instance.cleanup();
	}
	exports.instance = window.matcher = null;
};

exports.cmdSetEnabled = function(args, request) {
	// Create a new Matcher object
	exports.init();
	
	// Variable alias
	var matcher = exports.instance;
	
	// If no "enable" argument is specified, toggle the existing setting value
	if(typeof args.enable === 'undefined' || args.enable === null) {
		args.enable = !matcher.enabled;
	}
	
	// Explicitly enable bracket matching
	if(/^(1|true|yes|on|enable|match)$/i.test(args.enable)) {
		matcher.enabled = true;
		matcher.selectionChanged(env.editor.selection);
		
		request.done('Bracket matching <b>enabled</b>');
	}
	// Explicitly disable bracket matching
	else if(/^(0|false|no|off|disable|no[-_]?match)$/i.test(args.enable)) {
		matcher.enabled = false;
		
		request.done('Bracket matching <b>disabled</b>');
	}
	// Display current setting
	else {
		request.done('Bracket matching is <b>' + (matcher.enabled ? 'enabled' : 'disabled') + '</b>');
	}
};

exports.cmdJumpToMatching = function(args, request) {
	// Create and enable the matcher if it hasn't been initialized yet
	if(!exports.instance) {
		exports.cmdSetEnabled({ enable: true }, { done: function() {} });
	}
	
	exports.instance.jumpToMatching();
}