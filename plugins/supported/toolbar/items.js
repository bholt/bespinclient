/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Bespin.
 *
 * The Initial Developer of the Original Code is
 * Mozilla.
 * Portions created by the Initial Developer are Copyright (C) 2009
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Bespin Team (bespin@mozilla.com)
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

var catalog = require('bespin:plugins').catalog;
var notifier = catalog.getObject('notifier');
var env = require('environment').env;
var Promise = require('bespin:promise').Promise;
var file_commands = require('file_commands');
var editSession = catalog.getObject('editSession');
var pathutils = require('filesystem:path');
var $ = require('jquery').$;

function Logo() {
    var li = document.createElement('li');
    var img = document.createElement('img');
    img.setAttribute('src', catalog.getResourceURL('toolbar') + "/logo.png");
    img.setAttribute('class', 'bespin-toolbar-logo');
    li.appendChild(img);
    this.element = li;
}

exports.OpenFileIndicator = function OpenFileIndicator() {
    this.element = document.createElement('li');
	
    this.init.call(this);
};

exports.OpenFileIndicator.prototype = {
	init: function() {
		if(env.editor) {
			//doesn't get called on file open
			env.editor.willChangeBuffer.add(this.updateFile.bind(this));
		} else {
			setTimeout(this.init.bind(this), 100);
		}
	},
	updateFile: function(newBuffer) {
		if(newBuffer && newBuffer.file && newBuffer.file.path) {
			this.element.innerHTML = newBuffer.file.path;
		} else {
			setTimeout(this.updateFile(newBuffer).bind(this), 100);
			this.element.innerHTML = 'Untitled';
		}
		
		//alert('will change buffer called ' + newBuffer._file.path);
		//range = range || env.editor.selection;
		//if (newBuffer._file) {
		//this.element.innerHTML = newBuffer._file.path;
		//} else {
			//this.element.innerHTML = '**newfile**';
		//}
	}
};

exports.New = function New() {
	// 
	// Method 1: Plain DOM Objects
	//
    this.element = document.createElement('li');
	this.element.innerHTML = "<a id='new-button' class='toolbar-button' title='New file'>New</a>"
	
	//
	// Method 2: jQuery Objects
	//
	
	// See http://api.jquery.com/get/
	var $element = $('<li><a id="new-button" class="toolbar-button" title="New file">New</a></li>');
	this.element = $element.get(0);
	
	// It might be even better to store this.element as a jQuery object instead of a DOM object;
	// it would be more efficient in the long run and would give us greater control.
	
	this.init.call(this);
};
exports.New.prototype = {
	init: function() {
		$(this.element)
			.bind('click',this._new.bind(this));
	},
	_new: function() {
		console.log('new button clicked');
		env.commandLine.setInput('newfile ');
		
		/*file_commands.newfileCommand({}, {
			// Ajax callback function (fired immediately after GET request receives a response)
			async: function() { console.log('New.request.async(', arguments, ')'); },
			
			// Fired after any post-ajax processing
			done: function() { console.log('New.request.done(', arguments, ')'); }
		});*/
	}
}

exports.Open = function Open() {
	// 
	// Method 1: Plain DOM Objects
	//
    this.element = document.createElement('li');
	this.element.innerHTML = "<a id='open-button' class='toolbar-button' title='Open file'>Open</a>"
	
	//
	// Method 2: jQuery Objects
	//
	
	// See http://api.jquery.com/get/
	var $element = $('<li><a id="open-button" class="toolbar-button" title="Open file">Open</a></li>');
	this.element = $element.get(0);
	
	// It might be even better to store this.element as a jQuery object instead of a DOM object;
	// it would be more efficient in the long run and would give us greater control.
	
	this.init.call(this);
};
exports.Open.prototype = {
	init: function() {
		$(this.element)
			.bind('click',this._open.bind(this));
	},
	_open: function() {
		console.log('open button clicked');
		
		file_commands.openCommand({}, {
			// Ajax callback function (fired immediately after GET request receives a response)
			async: function() { console.log('Open.request.async(', arguments, ')'); },
			
			// Fired after any post-ajax processing
			done: function() { console.log('Open.request.done(', arguments, ')'); }
		});
	}
}

exports.Save = function Save() {
	// 
	// Method 1: Plain DOM Objects
	//
	
    this.element = document.createElement('li');
	this.element.innerHTML = "<a id='save-button' class='toolbar-button' title='Save file'>Save</a>"
	
	//
	// Method 2: jQuery Objects
	//
	
	// See http://api.jquery.com/get/
	var $element = $('<li><a id="save-button" class="toolbar-button" title="Save file">Save</a></li>');
	this.element = $element.get(0);
	
	// It might be even better to store this.element as a jQuery object instead of a DOM object;
	// it would be more efficient in the long run and would give us greater control.
	
	this.init.call(this);
};
exports.Save.prototype = {
	init: function() {
		$(this.element)
			.bind('click', this._save.bind(this))
			.attr('title', 'Testing 123'); // Titles don't seem to show up for some reason
	},
	_save: function() {
		console.log('save button clicked');
		
		file_commands.saveCommand({}, {
			// Ajax callback function (fired immediately after GET request receives a response)
			async: function() { console.log('Save.request.async(', arguments, ')'); },
			
			// Fired after any post-ajax processing
			done: function() {
				console.log('Save.request.done(', arguments, ')');
				
				var filepath = (env.buffer._file.path);
				var filename = pathutils.basename(filepath);
				
				// We probably don't actually want to keep this, but it's handy to have as a reference.
				// It would be better to use some other means of graphically communicating that the buffer has been saved.
				notifier.notify({
					plugin: 'toolbar',
					notification: 'buffersaved',
					title: 'Saved',
					body: filename + ' was successfully saved.'
				});
			}
		});
	}
}



exports.Undo = function Undo() {
	// 
	// Method 1: Plain DOM Objects
	//
	
    this.element = document.createElement('li');
	this.element.innerHTML = "<a id='undo-button' class='toolbar-button' title='Undo'>Undo</a>"
	
	//
	// Method 2: jQuery Objects
	//
	
	// See http://api.jquery.com/get/
	var $element = $('<li><a id="undo-button" class="toolbar-button" title="Undo">Undo</a></li>');
	this.element = $element.get(0);
	
	// It might be even better to store this.element as a jQuery object instead of a DOM object;
	// it would be more efficient in the long run and would give us greater control.
	
	this.init.call(this);
};

exports.Undo.prototype = {
	init: function() {
		$(this.element)
			.bind('click',this._undo.bind(this));
	},
	_undo: function() {
		console.log('undo button clicked');
		
		env.editor.buffer.undoManager.undo({}, {
			// Ajax callback function (fired immediately after GET request receives a response)
			async: function() { console.log('Undo.request.async(', arguments, ')'); },
			
			// Fired after any post-ajax processing
			done: function() { console.log('Undo.request.done(', arguments, ')'); }
		});
	}
}

exports.Redo = function Redo() {
	// 
	// Method 1: Plain DOM Objects
	//
	
    this.element = document.createElement('li');
	this.element.innerHTML = "<a id='redo-button' class='toolbar-button' title='Redo'>Redo</a>"
	
	//
	// Method 2: jQuery Objects
	//
	
	// See http://api.jquery.com/get/
	var $element = $('<li><a id="redo-button" class="toolbar-button" title="Redo">Redo</a></li>');
	this.element = $element.get(0);
	
	// It might be even better to store this.element as a jQuery object instead of a DOM object;
	// it would be more efficient in the long run and would give us greater control.
	
	this.init.call(this);
};

exports.Redo.prototype = {
	init: function() {
		$(this.element)
			.bind('click',this._redo.bind(this));
	},
	_redo: function() {
		console.log('redo button clicked');
		
		env.editor.buffer.undoManager.redo({}, {
			// Ajax callback function (fired immediately after GET request receives a response)
			async: function() { console.log('Redo.request.async(', arguments, ')'); },
			
			// Fired after any post-ajax processing
			done: function() { console.log('Redo.request.done(', arguments, ')'); }
		});
	}
}



exports.PositionIndicator = function PositionIndicator() {
    this.element = document.createElement('li');
	this.element.id = 'position-indicator';
	
    this.init.call(this);
};

exports.PositionIndicator.prototype = {
	init: function() {
		if(env.editor) {
			env.editor.selectionChanged.add(this.updatePosition.bind(this));
		} else {
			setTimeout(this.init.bind(this), 100);
		}
	},
	updatePosition: function(range) {
		range = range || env.editor.selection;
		this.element.innerHTML = "Row: " + (range.end.row + 1) + " Col: " + (range.end.col + 1);
	}
};

/*
// Function signature for "button group":
buttonGroup.add({
	'name': 'save',
	'title': 'Tooltip text',
	
	'id': 'save-button',
	'class': '.button .dropdown .extra-class',
	
	// Allow any of the following:
	'contents': '<img src="my-image.png"/>',
	'contents': document.createElement('img'),
	'contents': $('<img src="my-image.png"/>'),
	
	// Allow any of the following:
	'command': 'save',
	'command': file_command.save,
	'action': function() {
		file_command.save();
	}
});
*/

exports.Logo = Logo;
