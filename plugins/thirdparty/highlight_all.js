"define metadata";
({
	"description": "Highlights all occurrences of a selected word",
	"dependencies": { "standard_syntax": "0.0.0", "jquery": "0.0.0" },
	"provides": [
		{
			"ep": "extensionpoint",
			"name": "highlight_all",
			"description": "Highlights all occurrences of a word or variable when the user selects it in the editor"
		},
		{
			"ep": "command",
			"name": "highlightall",
			"params": [
				{
					"name": "enable",
					"type": "text",
					"description": "Enable or disable occurrence highlighting",
					"defaultValue": "true"
				}
			],
			"description": "Highlight all occurrences of selected text in the editor",
			"pointer": "#setEnabled"
		},
		{
			"ep": "command",
			"name": "highlightall.caseSensitive",
			"params": [
				{
					"name": "enable",
					"type": "text",
					"description": "Enable or disable case-sensitivity",
					"defaultValue": "true"
				}
			],
			"description": "Force occurrence matching to be case-sensitive or case-insensitive",
			"pointer": "#setCaseSensitive"
		}
	]
});
"end";

/*
HOW TO USE:

	1.	Copy this plugin to the /bespinclient/plugins/thirdparty directory
	2.	Run this command in the Bespin command line:
			{}> highlightall [true|false]

NOTES:

	1.	Styling highlighted occurrences requires the presence of an "occurrence" property in "highlighterFG" and "highlighterBG" in plugins/supported/text_editor/package.json
	2.	By default, occurrence matching is case-sensitive.  This can be overridden by setting any of the following to false:
		a)	The second argument passed to the constructor:
				var highlighterObj = new Highlighter(env.editor, false)
		b)	The caseSensitive property:
				highlighterObj.caseSensitive = false
		c)	The global _caseSensitiveDefault property:
				exports.Highlighter.prototype._caseSensitiveDefault = false

ISSUES:

	1.	The algorithm used by _highlightAll() and _highlightRange() is slow when editing large files (> 1,000 lines) with many occurrences.
		It takes approximately 0.5 sec to highlight all occurrences of "this" in a typical JavaScript file with around 5,500 lines of code.
		It may need to be re-worked slightly to improve its speed and efficiency.
	2.	Double-clicking sometimes highlights all occurrences and then immediately removes the highlights.
		This strange double-click behavior is part of the Bespin core, not highlight_all, but it would be good to fix the bug anyway.
		It likely has something to do with the timing of firing the editor's "click" and "double-click" event handlers.

UNIT TESTING (TODO):

	Complete unit testing of this plugin's major components.

*/

// Load required plugin files
var console = require('bespin:console').console;
var rangeUtils = require('rangeutils:utils/range');
var util = require('bespin:util/util');
var env = require('environment').env;
var $ = require('jquery').$;

// Utility function to escape special regex "metacharacters" in a string.
// Useful for sanitizing user input so it can be used in regular expressions.
RegExp.escape = function(text) {
	return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
}

/*
 * @class
 * 
 * Constructor.  Highlights all occurrences of a selected word or variable name.
 */
exports.Highlighter = function(editor, caseSensitive) {
	this.editor = editor || env.editor;
	this.caseSensitive = caseSensitive;
	
	// Bind event handler for text selection
	this.editor.selectionChanged.add('highlight_all', this.selectionChanged.bind(this));
	
	this._log('highlight_all plugin initialized!');
};

/*
 * @class
 * 
 * Prototype.  Defines all properties and functions of the Highlighter class.
 */
exports.Highlighter.prototype = {
	
	// Display counter for verbose console output
	_i: 0,
	
	// Enable/disable verbose console output
	DEBUG: false,
	
	// Enable/disable profiling in Firebug (to see how long each function takes to do its thing)
	PROFILE: false,
	
	// Whether highlighting is turned on (i.e., all occurrences are being physically highlighted at this exact moment)
	_enabled: false,
	
	// Whether occurrence matching is case sensitive or not
	_caseSensitive: undefined,
	_caseSensitiveDefault: true,
	
	// Collection of all occurrences of a selected word or variable
	_occurrences: [],
	
	// List of all lines where occurrences appear.  Used to optimize _removeHighlight() so that it only searches rows where occurrences appear.
	_rows: [],
	
	/*
	 * Event handler that will be fired whenever the selection changes inside the editor.
	 * Finds all occurrences of the currently selected text (if any) and highlights them.
	 */
	selectionChanged: function(newRange) {
		if(this.PROFILE) {
			console.profile();
		}
		
		// Disabled or invalid argument; abandon ship!
		if(!this.enabled || !rangeUtils.isRange(newRange)) {
			return;
		}
		
		// Remove all highlights
		this._removeHighlight();
		
		// Reset occurrences and rows array
		this._occurrences = [];
		this._rows = [];
		
		// Determine what to do with the user's selection
		this._handleSelectionRange(newRange);
		
		// Highlight all occurrences
		this._highlightAll();
		
		if(this.PROFILE) {
			console.profileEnd();
		}
	},
	
	// Handles a text range from a user's selected text
	_handleSelectionRange: function(newRange) {
		// User didn't select any text
		if (rangeUtils.isZeroLength(newRange)) {
			return;
		}
		
		// Example line of text: "I am a BANANA!!"
		//   selected = "BANANA"
		//   extended = " BANANA!"
		var range = { selected: {}, extended: {} },
			chars = { selected: '', extended: '' };
		
		range.selected = this.editor.selection; // uses "selection" property's getter; or use: this.editor.textView.getSelectedRange()
		chars.selected = this.editor.selectedText; // uses "selectedText" property's getter; or use: this.editor.textView.getSelectedCharacters()
		
		// Make a deep copy of the selected range
		// See http://api.jquery.com/jQuery.extend/
		range.extended = $.extend(true, {}, range.selected);
		
		// Extend the selected range by 1 character in each direction (effectively adds the character before and after the selected text)
		range.extended.start.col -= 1;
		range.extended.end.col += 1;
		
		// Get the characters that make up the extended selection range
		chars.extended = this.editor.getText(range.extended); // or: this.editor.layoutManager.textStorage.getCharacters(range.extended)
		
		this._log('Non zero-length range: { selected: "', chars.selected, '", extended: "', chars.extended, '" }');
		
		// Check the characters before and after the user's selection and verify that the selection
		// constitutes a complete word (i.e., selection starts and stops at word boundaries).
		if(this._isSingleWordSelected(chars)) {
			this._findAllOccurrences(range.selected, chars.selected);
		}
	},
	
	// Given a string of selected characters and a string of selected characters including the character before and after the selection,
	// this function determines if the user selected an entire word (e.g., they selected "variable_name" from "var variable_name = 3").
	_isSingleWordSelected: function(chars) {
		// Is the selected text entirely "word characters" (e.g., a-z, A-Z, 0-9, and _)?
		var allWordChars = /^[\w_]+$/.test(chars.selected);
		
		// Is the selected word a complete word, separated from other nearby words by a word boundary or a non-"word character"?
		var completeWord = new RegExp("^([^\\w_]|\\b|)" + RegExp.escape(chars.selected) + "([^\\w_]|\\b|)$", "i").test(chars.extended);
		
		// If both conditions are met, the user has selected a single, distinct word
		return allWordChars && completeWord;
	},
	
	_findAllOccurrences: function(selectedRange, selectedChars) {
		this._log('\tNon whitespace range: "', selectedChars, '" ', selectedRange);
		
		// Flags for regular expression to search for text
		var flags = this.caseSensitive ? 'g' : 'gi';
		
		// Regular Expression to match whole words only
		var searchRegex = new RegExp('\\b(' + RegExp.escape(selectedChars) + ')\\b', flags);
		
		// Set search params
		this.editor.searchController.setSearchText(searchRegex, /* isRegExp = */ true);
		
		// Loop counter for debugging output
		this._i = 1;
		
		// Initial dummy values for editor.searchController.findNext() and rangeUtils.equal()
		var curOccurrence = { end: { col: 0, row: 0 } };
		var firstOccurrence;
		
		// Loop through every search result for the text in the editor
		while(curOccurrence = this._getNextOccurrence(curOccurrence)) {
			// Search wrapped around to the first occurrence, which means we've processed all occurrences.
			if(firstOccurrence && curOccurrence === firstOccurrence) {
				break;
			}
			// Current occurrence is the user's selection; ignore this occurrence.
			else if(rangeUtils.equal(curOccurrence, selectedRange)) {
				continue;
			}
			
			// Check the current occurrence and add it to the list of occurrences, if necessary
			this._handleOccurrence(curOccurrence);
			
			// Remember the first occurrence
			firstOccurrence = firstOccurrence || curOccurrence;
		}
	},
	
	_getNextOccurrence: function(curOccurrence) {
		return this.editor.searchController.findNext(/* startPos = */ curOccurrence.end, /* allowFromStart = */ false);
	},
	
	_handleOccurrence: function(curOccurrence) {
		var occurrenceText = this.editor.getText(curOccurrence);
		var row = curOccurrence.start.row;
		
		// Add the current row to the list of rows if it is not already present
		if(this._rows.indexOf(row) === -1) {
			this._rows.push(row);
		}
		
		// Add occurrence to the list
		this._occurrences.push({
			range: curOccurrence,
			text: occurrenceText
		});
		
		this._logOccurrence(curOccurrence, occurrenceText);
	},
	
	_logOccurrence: function(curOccurrence, occurrenceText) {
		this._log('\t\tSearch result ', this._i++, ': ' + 
				  '(', curOccurrence.start.row, ', ', curOccurrence.start.col, ') to ' +
				  '(', curOccurrence.end.row, ', ', curOccurrence.end.col, '): ' +
				  '"', occurrenceText, '"');
	},
	
	/*
	 * Highlights all occurrences of the selected text
	 */
	_highlightAll: function() {
		if(this._occurrences.length === 0) {
			return;
		}
		
		this._log(' ');
		this._log('_highlightAll():');
		this._log('\t._occurrences: ', this._occurrences);
		
		for(var i = 0; i < this._occurrences.length; i++) {
			this._highlightRange(this._occurrences[i].range);
		}
		
		// Force the canvas to redraw itself
		this.editor.textView.invalidate();
	},
	
	// Inserts a highlight style for the given text range into the line's syntax styles
	_highlightRange: function(range) {
		this._log('\trow ', range.start.row, ' colors:');
		
		var row = range.start.row;
		var line = this.editor.layoutManager.textLines[row];
		var colors = line.colors;
		
		var highlightColor = {
			start: range.start.col,
			end: range.end.col,
			state: [],
			tag: 'occurrence',
			_highlight: {
				remove: true
			}
		};
		
		this._log('\t\tbefore highlight: ', colors);
		
		for(var i = 0; i < colors.length; i++) {
			var color = colors[i];
			
			// Current color spans the range that our new highlight color will occupy
			if(highlightColor.start >= color.start && highlightColor.end <= color.end) {
				// Insert a new highlighted syntax color into the line's color array
				this._insertColor(colors, i, highlightColor);
				
				// We're done!
				break;
			}
		}
		
		this._log('\t\tafter highlight: ', colors);
	},
	
	_insertColor: function(colors, index, highlightColor) {
		// Reference to existing color object
		var leftColor = colors[index];
		
		leftColor._highlight = leftColor._highlight || {};
		
		// Make a deep clone of leftColor
		var rightColor = $.extend(true, {}, leftColor);
		
		// Mark rightColor for removal during cleanup
		rightColor._highlight.remove = true;
		
		// Save original start/end values
		leftColor._highlight.start = leftColor.start;
		leftColor._highlight.end = leftColor.end;
		
		// Set new end value for leftColor
		leftColor.end = highlightColor.start;
		
		// Set new start value for rightColor
		rightColor.start = highlightColor.end;
		
		// Clone leftColor's "state" property
		highlightColor.state = $.extend(true, [], leftColor.state);
		
		// Insert highlightColor and rightColor into the array of colors -after- leftColor
		colors.splice(index + 1, 0, highlightColor, rightColor);
	},
	
	_removeHighlight: function() {
		if(this._occurrences.length === 0) {
			return;
		}
		
		this._log(' ');
		this._log('_removeHighlight():');
		this._log('\t._occurrences: ', this._occurrences);
		
		// Loop through each row of occurrences and remove highlighting
		this._rows.forEach(this._removeRowHighlight.bind(this));
		
		// Force the canvas to redraw itself
		this.editor.textView.invalidate();
	},
	
	_removeRowHighlight: function(row) {
		this._log('\trow ', row, ' colors:');
		
		var line = this.editor.layoutManager.textLines[row];
		var colors = line.colors;
		
		this._log('\t\tbefore removing highlight: ', colors);
		
		// Loop backwards to prevent an infinite loop
		for(var i = colors.length - 1; i >= 0; i--) {
			var color = colors[i];
			
			// Current color was inserted dynamically by this plugin
			if(color._highlight) {
				this._restoreColor(colors, i);
			}
		}
	
		this._log('\t\tafter removing highlight: ', colors);
	},
	
	_restoreColor: function(colors, index) {
		var color = colors[index];
		
		// Color is marked for removal; remove it
		if(color._highlight.remove) {
			colors.splice(index, 1);
		}
		// Reset the current color's original start and end values
		else {
			color.start = color._highlight.start;
			color.end = color._highlight.end;
		
			delete color._highlight;
		}
	},
	
	_log: function() {
		if(this.DEBUG) {
			console.log.apply(this, arguments);
		}
	}
	
};

Object.defineProperties(exports.Highlighter.prototype, {
	caseSensitive: {
		set: function(enable) {
			var newVal = typeof enable !== 'undefined' ? enable : this._caseSensitiveDefault;
			var changed = this._caseSensitive !== newVal;
			
			this._caseSensitive = newVal;
			
			if(changed) {
				this.selectionChanged(this.editor.textView.getSelectedRange());
			}
		},
		
		get: function() {
			return this._caseSensitive;
		}
	},
	
	enabled: {
		set: function(enable) {
			// Turn on highlighting
			if(enable) {
				this._enabled = true;
				this._highlightAll();
			}
			// Turn off highlighting
			else {
				this._enabled = false;
				this._removeHighlight();
			}
		},

		get: function() {
			return this._enabled;
		}
	}
});

// [API]: Special "destructor" function.
// Gets called before the plugin is reloaded.
exports.cleanup = function() {
	env.editor.selectionChanged.remove('highlight_all');
	exports.instance = window.highlighter = null;
};

exports.init = function() {
	if(!exports.instance) {
		// Initialize selection highlighting in the editor
		exports.instance = window.highlighter = new exports.Highlighter(env.editor);
	}
};

exports.setEnabled = function(args, command) {
	console.log('highlight_all.exports.setEnabled(', arguments, ')');
	
	exports.init();
	
	// Explicitly enable occurrence highlighting
	if(/^(1|true|yes|on|enable|highlight)$/i.test(args.enable)) {
		exports.instance.enabled = true;
		exports.instance.selectionChanged(env.editor.selection);
	}
	// Explicitly disable occurrence highlighting
	else if(/^(0|false|no|off|disable|no[-_]?highlight)$/i.test(args.enable)) {
		exports.instance.enabled = false;
	}
};

exports.setCaseSensitive = function(args, command) {
	console.log('highlight_all.exports.setCaseSensitive(', arguments, ')');
	
	exports.init();
	
	// Explicitly enable occurrence highlighting
	if(/^(1|true|yes|on|enable|highlight)$/i.test(args.enable)) {
		exports.instance.caseSensitive = true;
	}
	// Explicitly disable occurrence highlighting
	else if(/^(0|false|no|off|disable|no[-_]?highlight)$/i.test(args.enable)) {
		exports.instance.caseSensitive = false;
	}
};