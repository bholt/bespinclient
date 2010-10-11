"define metadata";
({
	"description": "Highlights all occurrences of a selected word",
	"dependencies": { "standard_syntax": "0.0.0", "jquery": "0.0.0", "color_injector": "0.0.0" },
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
					"defaultValue": null
				}
			],
			"key": "ctrl_shift_h",
			"description": "Highlight all occurrences of selected text in the editor",
			"pointer": "#cmdSetEnabled"
		},
		{
			"ep": "command",
			"name": "highlightall.caseSensitive",
			"params": [
				{
					"name": "enable",
					"type": "text",
					"description": "Enable or disable case-sensitivity",
					"defaultValue": null
				}
			],
			"description": "Force occurrence matching to be case-sensitive or case-insensitive",
			"pointer": "#cmdSetCaseSensitive"
		}
	]
});
"end";

/*
HOW TO USE:

	1.	Copy this plugin to the /bespinclient/plugins/thirdparty directory
	
	2.	Enable or disable this plugin using the following command in the Bespin command line:
			{}> highlightall [true|false|on|off]
			
	3.	Toggle case sensitivity with this command:
			{}> highlightall.caseSensitive [true|false|on|off]

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

	1.	Double-clicking sometimes highlights all occurrences and then immediately removes the highlights.
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

var catalog = require('bespin:plugins').catalog;
var settings = require('settings').settings;

var ColorInjector = require('color_injector').ColorInjector;

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
	
	/** Arrays and objects need to be initialized HERE (in the constructor), NOT in the prototype. **/
	/** Otherwise, multiple instances of this class will all have variables that reference the same object! **/
	// Collection of all occurrences of a selected word or variable name *that have not been highlighted in the editor yet*.
	// Indexed by row (i.e., the row number is the array index): [ 4: [ occurrence0, occurrence1, occurrence2 ], 12: [ occurence3 ] ]
	this._occurrences = [];
	
	// Create a new Color Injector to do the highlighting
	this.injector = new ColorInjector(this.editor, 'highlight_all');
	
	// Bind event handler for text selection
	this.editor.selectionChanged.add('highlight_all', this.selectionChanged.bind(this));
	
	/** THESE ARE UNNECESSARY - REPLACED BY this.editor.textView.clippingChanged.add(...) **/
	/*
	
	// Bind event handler for scrolling (includes mouse wheel, page up/page down, etc.)
	this.editor.verticalScroller.valueChanged.add('highlight_all', this.editorChanged.bind(this));
	this.editor.horizontalScroller.valueChanged.add('highlight_all', this.editorChanged.bind(this));
	
	// Register event handler for window resize
	catalog.registerExtension('dimensionsChanged', {
		pointer: this.editorChanged.bind(this)
	});
	
	*/
	/** THESE ARE UNNECESSARY - REPLACED BY this.editor.textView.clippingChanged.add(...) **/
	
	// Bind event handler for editor clipping change
	this.editor.textView.clippingChanged.add('highlight_all', this.editorChanged.bind(this));
	
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
	
	// Enable/disable profiling in Firebug (to see how long each function takes to execute)
	PROFILE: false,
	
	// Whether highlighting is enabled
	_enabled: false,
	
	// Whether occurrence matching is case sensitive or not
	_caseSensitive: undefined,
	_caseSensitiveDefault: true,
	
	// Timeout used for window resizing and editor scrolling
	_timeout: null,
	
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
		this.removeHighlight();
		
		// Determine what to do with the user's selection
		this._handleSelectionRange(newRange);
		
		// Highlight all occurrences
		this.highlightVisible();
		
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
	
	// Finds and stores all occurrences of the selected text
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
		
		// Loop through every search result for the text in the editor
		while(curOccurrence = this._getNextOccurrence(curOccurrence)) {
			// Skip highlighting if the current occurrence is the user's selection
			if(rangeUtils.equal(curOccurrence, selectedRange)) {
				continue;
			}
			
			// Add the current occurrence to the list of occurrences
			this._handleOccurrence(curOccurrence);
		}
	},
	
	// Make the search controller do all the hard work :-D
	_getNextOccurrence: function(curOccurrence) {
		return this.editor.searchController.findNext(/* startPos = */ curOccurrence.end, /* allowFromStart = */ false);
	},
	
	_handleOccurrence: function(curOccurrence) {
		var row = curOccurrence.start.row;
		
		// Make sure an array is initialized for the current row
		this._occurrences[row] = this._occurrences[row] || [];
		
		// Add the occurrence to the list of occurrences in that row
		this._occurrences[row].push(curOccurrence);
		
		// Log it
		this._logOccurrence(curOccurrence);
	},
	
	_logOccurrence: function(curOccurrence) {
		if(this.DEBUG) {
			this._log('\t\tSearch result ', this._i++, ': ' + 
				  	'(', curOccurrence.start.row, ', ', curOccurrence.start.col, ') to ' +
				  	'(', curOccurrence.end.row, ', ', curOccurrence.end.col, ')');
		}
	},
	
	_getVisibleRows: function() {
		// Get the clipping frame (the pixel coordinates of the visible portion of the editor)
		var clippingFrame = this.editor.textView.clippingFrame;
		
		// Get the text range that resides in the clipping frame
		var clippingRange = this.editor.layoutManager.characterRangeForBoundingRect(clippingFrame);
		
		return {
			start: clippingRange.start.row,
			end: clippingRange.end.row
		};
	},
	
	editorChanged: function() {
		this.highlightVisible();
		
		// Clear existing timeout
		clearTimeout(this._timeout);
		
		// Create a new timeout, set to fire in 500 ms (1/2 sec)
		//this._timeout = setTimeout(function() { console.log('Timeout fired'); this.highlightVisible(); }.bind(this), 1000);
	},
	
	/*
	 * Highlights all visible occurrences of the selected text in the editor
	 */
	highlightVisible: function() {
		if(this._occurrences.length === 0) {
			return;
		}
		
		this._log(' ');
		this._log('highlightVisible():');
		this._log('\t._occurrences: ', this._occurrences);
		
		var visibleRows = this._getVisibleRows();
		
		// Loop through each row of occurrences
		for(var i = visibleRows.start; i <= visibleRows.end && i < this._occurrences.length; i++) {
			var curRow = this._occurrences[i];
			
			// Skip undefined rows
			if(!curRow) {
				continue;
			}
			
			// Loop backwards through each occurrence in the row
			for(var j = curRow.length - 1; j >= 0; j--) {
				// Remove the last occurrence from the array and highlight it
				this._highlightRange(curRow.pop());
			}
		}
	},
	
	// Inserts a highlight style for the given text range into the line's syntax styles
	_highlightRange: function(range) {
		this._log('\trow ', range.start.row, ' colors:');
		
		this.injector.inject(range.start.row, {
			start: range.start.col,
			end: range.end.col,
			state: [],
			tag: 'occurrence'
		});
	},
	
	removeHighlight: function() {
		// Reset occurrences object
		this._occurrences = [];
		
		// Clean up the highlighting
		this.injector.cleanAll();
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
				this.highlightVisible();
			}
			// Turn off highlighting
			else {
				this._enabled = false;
				this.removeHighlight();
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

exports.cmdSetEnabled = function(args, request) {
	//console.log('highlight_all.exports.cmdSetEnabled(', arguments, ')');
	
	exports.init();
	
	// If no "enable" argument is specified, toggle the existing setting value
	if(typeof args.enable === 'undefined' || args.enable === null) {
		args.enable = !exports.instance.enabled;
	}
	
	var message = '';
	
	// Explicitly enable occurrence highlighting
	if(/^(1|true|yes|on|enable|highlight)$/i.test(args.enable)) {
		exports.instance.enabled = true;
		exports.instance.selectionChanged(env.editor.selection);
		
		message = 'Highlighting turned <b>on</b>';
	}
	// Explicitly disable occurrence highlighting
	else if(/^(0|false|no|off|disable|no[-_]?highlight)$/i.test(args.enable)) {
		exports.instance.enabled = false;
		
		message = 'Highlighting turned <b>off</b>';
	}
	// 
	else {
		message = 'Highlighting is <b>' + (exports.instance.enabled ? "on" : "off") + '</b>';
	}
	
	// Display a message in the command input log if the user typed in a command
	// (but not if they hit the keystroke CTRL + SHIFT + H)
	if(request.typed) {
		request.done(message);
	}
};

exports.cmdSetCaseSensitive = function(args, request) {
	//console.log('highlight_all.exports.cmdSetCaseSensitive(', arguments, ')');
	
	exports.init();
	
	var highlighter = exports.instance;
	
	// If no "enable" argument is specified, toggle the existing setting value
	if(typeof args.enable === 'undefined' || args.enable === null) {
		args.enable = !highlighter.caseSensitive;
	}
	
	// Explicitly enable case sensitivity
	if(/^(1|true|yes|on|enable|highlight)$/i.test(args.enable)) {
		highlighter.caseSensitive = true;
		
		request.done('Highlighting is now <b>case sensitive</b>');
	}
	// Explicitly disable case sensitivity
	else if(/^(0|false|no|off|disable|no[-_]?highlight)$/i.test(args.enable)) {
		highlighter.caseSensitive = false;
		
		request.done('Highlighting is now <b>case in-sensitive</b>');
	}
	// 
	else {
		request.done('Highlighting is <b>case ' + (highlighter.caseSensitive ? '' : 'in-') + 'sensitive</b>');
	}
};