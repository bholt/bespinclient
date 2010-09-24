"define metadata";
({
	"description": "Highlights matching pairs of characters",
	"dependencies": { "standard_syntax": "0.0.0", "jquery": "0.0.0", "highlight_all": "0.0.0" },
	"provides": [
		{
			"ep": "extensionpoint",
			"name": "match_pairs",
			"description": "Matches some pairs, mkay?"
		}
	]
});
"end";

console.clear();

var $ = bespin.tiki.sandbox.require('jquery').$;
var rangeUtils = bespin.tiki.sandbox.require('rangeutils:utils/range');
var util = bespin.tiki.sandbox.require('bespin:util/util');
var env = bespin.tiki.sandbox.require('environment').env;
var editor = env.editor;

require('highlight_all');

var curPair = [];

var pairs = [
	{
		open: '(',
		close: ')'
	},
	{
		open: '[',
		close: ']'
	},
	{
		open: '{',
		close: '}'
	},
	{
		open: "'",
		close: "'"
	},
	{
		open: '"',
		close: '"'
	}
];

function getPair(char) {
	for(var i = 0; i < pairs.length; i++) {
		var pair = pairs[i];
		
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
}

var searchStrategies = {
	'-1': {
		getSearchRange: function(charRange, entireRange) {
			return { start: entireRange.start, end: { row: charRange.end.row, col: charRange.end.col - 1 } };
		},
		getNextCharPos: function(data) {
			var nextMatchingIndex = data.text.lastIndexOf(data.pair.matching);
			var nextSelectedIndex = data.text.lastIndexOf(data.pair.selected);
			
			data.distance == data.distance || 0;
			
			//console.log('-1: text.length = ', data.text.length, ', nextMatchingIndex = ', nextMatchingIndex, ', nextSelectedIndex = ', nextSelectedIndex);
			
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
		getSearchRange: function(charRange, entireRange) {
			return { start: { row: charRange.start.row, col: charRange.start.col + 1 }, end: entireRange.end };
		},
		getNextCharPos: function(data) {
			var nextMatchingIndex = data.text.indexOf(data.pair.matching);
			var nextSelectedIndex = data.text.indexOf(data.pair.selected);
			
			data.distance == data.distance || +1;
			
			//console.log('+1: text.length = ', data.text.length, ', nextMatchingIndex = ', nextMatchingIndex, ', nextSelectedIndex = ', nextSelectedIndex);
			
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
};

// Returns a string
function getMatches(charRange) {
	var char = highlighter.editor.getText(charRange);
	
	var pair = getPair(char);
	
	if(pair && pair.direction !== 0) {
		var searchStrategy = searchStrategies[pair.direction];
		
		var entireRange = highlighter.editor.layoutManager.textStorage.getRange();
		var searchRange = searchStrategy.getSearchRange(charRange, entireRange);
		
		var data = {
			text: highlighter.editor.getText(searchRange),
			pair: pair,
			distance: 0
		}
		
		console.log(searchRange);
		console.log(data.text);
		
		var sum = -1;
		var index = 0;
		
		while(sum !== 0 && index > -1 && data.text.length > 0) {
			var nextCharPos = searchStrategy.getNextCharPos(data);
			
			sum += nextCharPos.score;
			index = nextCharPos.index;
		}
		
		if(sum === 0 && index > -1) {
			console.log('Found: index = ', index, ', distance = ', data.distance);
			
			if(Math.abs(data.distance) === 1) {
				highlightPair(charRange, data.distance === -1 ? -1 : 0, 2);
			}
			else {
				highlightPair(charRange, 0);
				highlightPair(charRange, data.distance);
			}
			
			editor.textView.invalidate();
			
			console.log('charRange: ', charRange.start.col, ' to ', charRange.end.col);
			console.log('curPair: ', curPair);
			console.log(' ');
		} else {
			console.log('Not found!  sum = ', sum, ', index = ', index, ', distance = ', data.distance);
		}
	}
}

function highlightPair(charRange, distance, width) {
	var matchStart = editor.layoutManager.textStorage.displacePosition($.extend(true, {}, charRange.start), distance);
	var matchEnd = $.extend(true, {}, matchStart);
	
	matchEnd.col += (width || +1);
	
	var matchColor = {
		start: matchStart.col,
		end: matchEnd.col,
		state: [],
		tag: 'addition',
		_pair: {
			remove: true
		}
	};
	
	var row = matchStart.row;
	var line = editor.layoutManager.textLines[row];
	var colors = line.colors;
	
	/*
	console.log('matchColor: ', matchColor);
	console.log('row: ', row);
	console.log('line: ', line);
	console.log('colors: ', colors);
	*/
	
	for(var i = 0; i < colors.length; i++) {
		var color = colors[i];
		
		// Current color spans the range that our new highlight color will occupy
		if(matchColor.start >= color.start && matchColor.end <= color.end) {
			curPair.push({
				row: row,
				line: line,
				colors: colors,
				index: i
			});
			
			// Insert a new highlighted syntax color into the line's color array
			insertColor(colors, i, matchColor);
			
			// We're done!
			break;
		}
	}
}

function insertColor(colors, index, newColor) {
	// Reference to existing color object
	var leftColor = colors[index];
	
	leftColor._pair = leftColor._pair || {};
	
	// Make a deep clone of leftColor
	var rightColor = $.extend(true, {}, leftColor);
	
	// Mark rightColor for removal during cleanup
	rightColor._pair.remove = true;
	
	// Save original start/end values
	leftColor._pair.start = leftColor.start;
	leftColor._pair.end = leftColor.end;
	
	// Set new end value for leftColor
	leftColor.end = newColor.start;
	
	// Set new start value for rightColor
	rightColor.start = newColor.end;
	
	// Clone leftColor's "state" property
	newColor.state = $.extend(true, [], leftColor.state);
	
	// Insert newColor and rightColor into the array of colors -after- leftColor
	colors.splice(index + 1, 0, newColor, rightColor);
	
	//console.log('colors spliced: ', colors);
}

function removeHighlight() {
	if(curPair.length === 0) return;
	
	for(var j = curPair.length - 1; j >= 0; j--) {
		var curMatch = curPair[j];
		var colors = curMatch.colors;
	
		// Loop backwards to prevent an infinite loop
		for(var i = colors.length - 1; i >= 0; i--) {
			var color = colors[i];
		
			// Current color was inserted dynamically by this plugin
			if(color._pair) {
				restoreColor(colors, i);
			}
		}
		
		curPair.splice(j, 1);
	}
}

function restoreColor(colors, index) {
	var color = colors[index];
	
	// Color is marked for removal; remove it
	if(color._pair.remove) {
		colors.splice(index, 1);
	}
	// Reset the current color's original start and end values
	else {
		color.start = color._pair.start;
		color.end = color._pair.end;
	
		delete color._pair;
	}
}

highlighter.editor.selectionChanged.remove('pairChars');
highlighter.editor.selectionChanged.add('pairChars', function(range) {
	removeHighlight();
	
	// Make a deep clone so we can manipulate it without affecting other plugins
	range = rangeUtils.normalizeRange($.extend(true, {}, range));
	
	// 0 characters selected (cursor/insertion point placed)
	if(rangeUtils.isZeroLength(range)) {
		// Extend end col by 1 so we can use the next IF statement
		range.end.col += 1;
	}
	
	// Clone the text range and shift it 1 character to the left
	var rangeBefore = $.extend(true, {}, range);
	rangeBefore.start.col -= 1;
	rangeBefore.end.col -= 1;
	
	// Get the character before (to the left of) the user's selecetion
	var charBefore = highlighter.editor.getText(rangeBefore);
	
	// Abort if character is escaped with a backslash (\)
	if(charBefore === '\\') {
		return;
	}
	
	// 1 character selected
	if(Math.abs(range.start.col - range.end.col) === 1) {
		//console.log(range);
		getMatches(range);
	}
});