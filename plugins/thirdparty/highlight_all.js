"define metadata";
({
	"description": "Highlights all occurrences of a selected word",
	"dependencies": {},
	"provides": []
});
"end";

/*
HOW TO USE:

	1.	Copy this file to the /bespinclient/plugins/thirdparty directory

	2.	Run these commands in the Bespin "shell" (terminal):
			{}> plugin reload highlight_all
			{}> eval require("highlight_all")
	
		- OR -
	
	2.a	Run this command in the Bespin "shell" (terminal):
			{}> plugin reload highlight_all
	
	2.b	Run this command in the Firebug console:
			>>> bespin.tiki.sandbox.require('highlight_all');

INSPECTING THE API:

	(function() {
		var $ = bespin.tiki.sandbox.exports["::jquery:index"].exports.$;
		var rangeUtils = bespin.tiki.sandbox.require('rangeutils:utils/range');
		var env = bespin.tiki.sandbox.require('environment').env;
		var editor = env.editor;
		
		// Useful properties and functions:
		editor.layoutManager.textLines.length;
		editor.layoutManager.updateTextRows(startRow, stopRow);
		editor.textView._getContext()
		editor.textView.invalidate()
		editor.textView.clippingFrameChanged()
		
		console.log(env);
		console.log(editor);
	})();

NOTES:

	1.	Functions and variable names that begin with an underscore (_) are considered "private".
	2.	By default, text search is case-insensitive.

ISSUES:

	1.	May need some optimizations to improve speed, efficiency, performance, etc.
	2.	A new theme tag is required for highlighted occurrences; right now we're just hijacking the "addition" tag
	3.	Double-clicking sometimes highlights all occurrences and then immediately removes the highlighting
		(This problem is caused by one or more of the Bespin core plugins, not highlight_all)

UNIT TESTING (TODO):

	Complete unit testing of this plugin's major components.

*/

// Utility function to escape special regex "metacharacters" in a string.
// Useful for sanitizing user input so it can be used in regular expressions.
RegExp.escape = function(text) {
	return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
}

// Load required plugin files
var console = require('bespin:console').console;
var rangeUtils = require('rangeutils:utils/range');
var env = require('environment').env;
var $ = require('jquery').$;
var jQuery = $;

/*
 * @class
 * 
 * Constructor.  Highlights all occurrences of a selected word or variable name.
 */
exports.Highlighter = function(editor, caseSensitive) {
	this.editor = editor || env.editor;
	this.caseSensitive = caseSensitive || false;
	
	// Bind event handler for text selection
	this.editor.selectionChanged.add(this.selectionChanged.bind(this));
	
	window.highlighter = this;
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
	
	// Whether highlighting is turned on (i.e., all occurrences are being physically highlighted at this exact moment)
	_highlight: false,
	
	// Collection of all occurrences of a selected word or variable
	_occurrences: [],
	
	// List of all lines where occurrences appear.  Used to optimize _removeHighlight() so that it only searches rows where occurrences appear.
	_rows: [],
	
	/*
	 * Event handler that will be fired whenever the selection changes inside the editor.
	 * Finds all occurrences of the currently selected text (if any) and highlights them.
	 */
	selectionChanged: function(newRange) {
		// Invalid argument; abandon ship!
		if(!rangeUtils.isRange(newRange)) {
			return;
		}
		
		// Remove all highlights
		// A setter function is called whenever this value is set
		this.highlight = false;
		
		// Reset occurrences and rows array
		this._occurrences = [];
		this._rows = [];
		
		// Determine what to do with the user's selection
		this._handleSelectionRange(newRange);
		
		// Highlight all occurrences if there is at least one occurrence
		if(this._occurrences.length > 0) {
			// A setter function is called whenever this value is set
			this.highlight = true;
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
		range.extended = jQuery.extend(true, {}, range.selected);
		
		// Extend the selected range by 1 character in each direction (effectively adds the character before and after the selected text)
		range.extended.start.col -= 1;
		range.extended.end.col += 1;
		
		// Get the characters that make up the extended selection range
		chars.extended = this.editor.getText(range.extended); // or: this.editor.layoutManager.textStorage.getCharacters(range.extended)
		
		if(this.DEBUG) {
			console.log('Non zero-length range: { selected: "', chars.selected, '", extended: "', chars.extended, '" }');
		}
		
		// Check the characters before and after the user's selection and verify that the selection
		// constitutes a complete word (i.e., selection starts and stops at word boundaries).
		if(this._isSingleWordSelected(chars)) {
			this._findAllOccurrences(range, chars);
		}
	},
	
	// Given a string of selected characters and a string of selected characters including the character before and after the selection,
	// this function determines if the user selected an entire word (e.g., they selected "variable_name" from "var variable_name = 3").
	_isSingleWordSelected: function(chars) {
		// Is the selected text entirely "word characters" (e.g., a-z, A-Z, 0-9, and _)?
		var isSelectionWordChars = /^[\w_]+$/.test(chars.selected);
		
		// Is the selected word a complete word, separated from other nearby words by a word boundary or a non-"word character"?
		var isSelectedWordDistinct = new RegExp("^[^\\w_]?\\b" + RegExp.escape(chars.selected) + "\\b[^\\w_]?$", "i").test(chars.extended);
		
		// If both conditions are met, the user has selected a single, distinct word
		return isSelectionWordChars && isSelectedWordDistinct;
	},
	
	_findAllOccurrences: function(range, chars) {
		if(this.DEBUG) {
			console.log('\tNon whitespace range: "', chars.selected, '" ', range.selected);
		}
		
		// Flags for regular expression to search for text
		var flags = 'g';
		
		if(!this.caseSensitive) {
			flags += 'i'; // i=caseInsensitive
		}
		
		// Regular Expression to match whole words only
		var searchRegex = new RegExp('\\b(' + RegExp.escape(chars.selected) + ')\\b', flags);
		
		// Set search params
		this.editor.searchController.setSearchText(searchRegex, /* isRegExp = */ true);
		
		// Loop counter for debugging output
		this._i = 1;
		
		// Initial placeholder values for this.editor.searchController.findNext() and rangeUtils.equal()
		var curOccurrence = { end: { col: 0, row: 0 } };
		var firstOccurrence;
		
		// Loop through every search result for the text in the editor
		while(curOccurrence = this._getNextOccurrence(curOccurrence)) {
			// Search wrapped around to the first result,
			// which means we've processed all results.
			if(firstOccurrence && rangeUtils.equal(curOccurrence, firstOccurrence)) {
				break;
			}
			
			// Check the current occurrence and add it to the list of occurrences, if necessary
			this._handleOccurrence(curOccurrence, range);
			
			// If the first result hasn't been initialized, initialize it
			if(!firstOccurrence) {
				firstOccurrence = curOccurrence;
			}
		}
	},
	
	_getNextOccurrence: function(curOccurrence) {
		return this.editor.searchController.findNext(/* startPos = */ curOccurrence.end, /* allowFromStart = */ false);
	},
	
	_handleOccurrence: function(curOccurrence, range) {
		// Only consider results that are NOT the currently selected text range
		if(!rangeUtils.equal(curOccurrence, range.selected)) {
			var occurrenceText = this.editor.getText(curOccurrence);
			var row = curOccurrence.start.row;
			
			// Add the current row to the list of rows if it is not already present
			if(this._rows.indexOf(row) == -1) {
				this._rows.push(row);
			}
			
			// Add occurrence to the list
			this._occurrences.push({
				range: curOccurrence,
				text: occurrenceText
			});
			
			this._logOccurrence(curOccurrence, occurrenceText);
		}
	},
	
	_logOccurrence: function(curOccurrence, occurrenceText) {
		if(this.DEBUG) {
			console.log('\t\tSearch result ', this._i++, ': ' + 
						'(', curOccurrence.start.row, ', ', curOccurrence.start.col, ') to ' +
						'(', curOccurrence.end.row, ', ', curOccurrence.end.col, '): ' +
						'"', occurrenceText, '"');
		}
	},
	
	/*
	 * Highlights all occurrences of the selected text
	 */
	_highlightAll: function() {
		if(this._occurrences.length == 0) {
			return;
		}
		
		if(this.DEBUG) {
			console.log(' ');
			console.log('_highlightAll():');
			console.log('\t._occurrences: ', this._occurrences);
		}
		
		for(var i = 0; i < this._occurrences.length; i++) {
			this._highlightRange(this._occurrences[i].range);
		}
	},
	
	// Inserts a highlight style for the given text range into the line's syntax styles
	_highlightRange: function(range) {
		if(this.DEBUG) {
			console.log('\trow ', range.start.row, ' colors:');
		}
		
		var layoutManager = this.editor.layoutManager;
		
		var row = range.start.row;
		var line = layoutManager.textLines[row];
		var colors = line.colors;
		
		if(this.DEBUG) {
			console.log('\t\tbefore highlight: ', colors);
		}
		
		var highlightColor = {
			start: range.start.col,
			end: range.end.col,
			state: [],
			tag: 'addition',
			_highlight: {
				remove: true
			}
		};
		
		// Loop backwards to prevent an infinite loop
		for(var i = colors.length - 1; i >= 0; i--) {
			var color = colors[i];
			
			if(highlightColor.start >= color.start && highlightColor.end <= color.end) {
				// Reference to "color" variable (the new name helps make the code easier to understand)
				var leftColor = color;
				
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
				
				// Copy leftColor's "state" to highlightColor
				highlightColor.state = $.extend(true, [], leftColor.state);
				
				// Inject highlightColor and rightColor into the array of colors
				colors.splice(i + 1, 0, highlightColor, rightColor);
				
				break;
			}
		}
		
		if(this.DEBUG) {
			console.log('\t\tafter highlight: ', colors);
		}
	},
	
	_removeHighlight: function() {
		if(this._occurrences.length == 0) {
			return;
		}
		
		if(this.DEBUG) {
			console.log(' ');
			console.log('_removeHighlight():');
			console.log('\t._occurrences: ', this._occurrences);
		}
		
		var layoutManager = this.editor.layoutManager;
		
		// Loop through each row of occurrences and remove highlighting
		this._rows.forEach(function(row, index, collection) {
			if(this.DEBUG) {
				console.log('\trow ', row, ' colors:');
			}
			
			var line = layoutManager.textLines[row];
			var colors = line.colors;
			
			if(this.DEBUG) {
				console.log('\t\tbefore removing highlight: ', colors);
			}
		
			// Loop backwards to prevent an infinite loop
			for(var i = colors.length - 1; i >= 0; i--) {
				var color = colors[i];
			
				if(color._highlight) {
					// Remove the current color
					if(color._highlight.remove) {
						colors.splice(i, 1);
					}
					// Reset the current color's original start and end values
					else {
						color.start = color._highlight.start;
						color.end = color._highlight.end;
					
						delete color._highlight;
					}
				}
			}
		
			if(this.DEBUG) {
				console.log('\t\tafter removing highlight: ', colors);
			}
		});
	}
	
};

Object.defineProperties(exports.Highlighter.prototype, {
	highlight: {
		set: function(enableHighlight) {
			// Turn on highlighting
			if(enableHighlight) {
				this._highlight = true;
				this._highlightAll();
			}
			// Turn off highlighting
			else {
				this._highlight = false;
				this._removeHighlight();
			}
			
			// Force the canvas to redraw itself
			this.editor.textView.invalidate();
		},

		get: function() {
			return this._highlight;
		}
	}
})

// [API]: Special "destructor" function.
// Gets called before the plugin is reloaded.
exports.cleanup = function() {
	env.editor.selectionChanged.remove(exports.Highlighter.selectionChanged);
}

// Initialize selection highlighting in the editor
new exports.Highlighter(env.editor);

console.log('highlight_all plugin initialized!');