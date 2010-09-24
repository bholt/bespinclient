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

var console = require('bespin:console').console;
var rangeUtils = require('rangeutils:utils/range');
var util = require('bespin:util/util');
var env = require('environment').env;
var $ = require('jquery').$;

exports.ColorInjector = function(editor, flagName) {
	this.editor = editor || env.editor;
	this.flagName = flagName;
};

exports.ColorInjector.prototype = {
	
	DEBUG: false,
	
	_rows: [],
	
	_cleanColors: {},
	
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
		
		newColor = $.extend(true, {}, newColor);
		
		var line = this.editor.layoutManager.textLines[row];
		
		if(!line.colors._injected) {
			this._cleanColors[row] = line.colors;
			
			line.colors = $.extend(false, [], line.colors);
			line.colors._injected = true;
		}
		
		var colors = line.colors;
		
		// Reference to existing color object
		var leftColor = colors[colorIndex];
	
		leftColor[flagName] = leftColor[flagName] || {};
		
		// Clear removal flag
		leftColor[flagName].remove = false;
	
		// Make a deep clone of leftColor
		var rightColor = $.extend(true, {}, leftColor);
	
		// Mark rightColor for removal during cleanup
		rightColor[flagName].remove = true;
	
		// Save original start/end values
		leftColor[flagName].start = leftColor.start;
		leftColor[flagName].end = leftColor.end;
	
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
			this.cleanRow(this._rows[i], true);
		}
		
		this.editor.textView.invalidate();
	},
	
	cleanRow: function(row, disableRedraw) {
		this.editor.layoutManager.textLines[row].colors = this._cleanColors[row];
		
		if(!disableRedraw) {
			this.editor.textView.invalidate();
		}
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