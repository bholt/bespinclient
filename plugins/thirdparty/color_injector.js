"define metadata";
({
	"description": "Injects colors into the syntax highlighter",
	"dependencies": { "standard_syntax": "0.0.0", "jquery": "0.0.0" },
	"provides": [
		{
			"ep": "extensionpoint",
			"name": "color_injector",
			"description": "Injectify!"
		}
	]
});
"end";

/*
ISSUES:

	1.	Highlighting two or more ranges that appear in a single row and color object (e.g., a "comment" color object) fails;
		the original color object does not get properly restored during cleanup.  Instead, the second range and everything after it
		get completely removed and the text becomes plain white.
		
		This algorithm should be re-designed and re-implemented.
		

UNIT TESTING (TODO):

	Complete unit testing of this plugin's major components.

*/

var console = require('bespin:console').console;
var rangeUtils = require('rangeutils:utils/range');
var util = require('bespin:util/util');
var env = require('environment').env;
var $ = require('jquery').$;

exports.ColorInjector = function(editor, flagName) {
	this.editor = editor || env.editor;
	this.flagName = flagName;
	
	/** Arrays and objects need to be initialized HERE (in the constructor), NOT in the prototype. **/
	/** Otherwise, multiple instances of this class will all have variables that reference the same object! **/
	this._rows = [];
};

exports.ColorInjector.prototype = {
	
	DEBUG: false,
	
	inject: function(row, newColor, flagName) {
		flagName = flagName || this.flagName;
		
		this._log('\trow ', row, ' colors:');
		
		newColor[flagName] = newColor[flagName] || {};
		newColor[flagName].remove = true;
		
		var line = this.editor.layoutManager.textLines[row];
		var colors = line.colors;
		
		this._log('\t\tbefore highlight: ', colors);
		
		for(var i = 0; i < colors.length; i++) {
			var color = colors[i];
			
			// Current color spans the range that our new highlight color will occupy
			if(newColor.start >= color.start && newColor.end <= color.end) {
				// Insert a new highlighted syntax color into the line's color array
				this.injectColor(newColor, row, i, flagName);
				
				// We're done!
				break;
			}
		}
		
		this._log('\t\tafter highlight: ', colors);
	},
	
	injectColor: function(newColor, row, colorIndex, flagName) {
		flagName = flagName || this.flagName;
		
		var line = this.editor.layoutManager.textLines[row];
		var colors = line.colors;
		
		// Reference to existing color object
		var leftColor = colors[colorIndex];
	
		leftColor[flagName] = leftColor[flagName] || {};
		
		// Make a deep clone of leftColor
		var rightColor = $.extend(true, {}, leftColor);
	
		// Mark rightColor for removal during cleanup
		rightColor[flagName].remove = true;
	
		// Save original start/end values
		if(!leftColor[flagName].hasOwnProperty('start')) {
			leftColor[flagName].start = leftColor.start;
			leftColor[flagName].end = leftColor.end;
		}
	
		// Set new end value for leftColor
		leftColor.end = newColor.start;
	
		// Set new start value for rightColor
		rightColor.start = newColor.end;
	
		// Clone leftColor's "state" property
		newColor.state = $.extend(true, [], leftColor.state);
	
		// Insert newColor and rightColor into the array of colors -after- leftColor
		colors.splice(colorIndex + 1, 0, newColor, rightColor);
		
		if(this._rows.indexOf(row) === -1) {
			this._rows.push(row);
		}
	
		this._log('colors spliced: ', colors);
	},
	
	cleanAll: function() {
		for(var i = this._rows.length - 1; i >= 0; i--) {
			// Clean 'er up
			this.cleanRow(this._rows[i], true);
			
			// Remove current row from array
			this._rows.splice(i, 1);
		}
		
		// Redraw canvas
		this.editor.textView.invalidate();
	},
	
	cleanRow: function(row, disableRedraw) {
		var flagName = this.flagName;
		
		//this._log('\trow ', row, ' colors:');
		
		var line = this.editor.layoutManager.textLines[row];
		
		if(!line) {
			return;
		}
		
		var colors = line.colors;
		
		//this._log('\t\tbefore highlight: ', colors);
		
		for(var i = colors.length - 1; i >= 0; i--) {
			var color = colors[i];
			
			if(color[flagName]) {
				this._restoreColor(colors, i, flagName);
			}
		}
		
		//this._log('\t\tafter highlight: ', colors);
		
		if(!disableRedraw) {
			this.editor.textView.invalidate();
		}
	},
	
	/*
	 * TODO: FIXME!  This algorithm (and/or the insertion algorithm) breaks when highlighting multiple occurrences on the same line.
	 */
	_restoreColor: function(colors, index, flagName) {
		var color = colors[index];
		
		// Color is marked for removal; remove it
		if(color[flagName].remove) {
			colors.splice(index, 1);
		}
		// Reset the current color's original start and end values
		else {
			color.start = color[flagName].start;
			color.end = color[flagName].end;
		
			delete color[flagName];
		}
	},
	
	getColorAt: function(pos) {
		var line = this.editor.layoutManager.textLines[pos.row];
		var colors = line.colors;
		
		for(var i = 0; i < colors.length; i++) {
			var color = colors[i];
			
			// Current color spans the range (1-character position) we're looking for
			if(pos.col >= color.start && pos.col + 1 <= color.end && color.start !== color.end) {
				return color;
			}
		}
		
		return null;
	},
	
	_log: function() {
		if(this.DEBUG) {
			console.log.apply(this, arguments);
		}
	}
	
};

Object.defineProperties(exports.ColorInjector.prototype, {
	flagName: {
		set: function(value) {
			this._flagName = value || 'injected';
			this._flagName = this._flagName.substring(0, 1) === '_' ? this._flagName : '_' + this._flagName;
		},
		get: function() {
			return this._flagName;
		}
	}
});