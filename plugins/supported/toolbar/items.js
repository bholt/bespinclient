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

var env = require('environment').env;

var Promise = require('bespin:promise').Promise;

var file_commands = require('file_commands');

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
		//alert('will change buffer called ' + newBuffer._file.path);
		//range = range || env.editor.selection;
		//if (newBuffer._file) {
			this.element.innerHTML = newBuffer._file.path;
		//} else {
			//this.element.innerHTML = '**newfile**';
		//}
	}
};


exports.Save = function Save() {
    this.element = document.createElement('li');
	this.element.innerHTML = "<a id='save_button' class='toolbar_button'>Save</a>"
	this.init.call(this);
};
exports.Save.prototype = {
	init: function() {
		$(this.element).bind('click', this._save.bind(this));
		//this.element.addEventListener('click', this._save.bind(this));
	},
	_save: function() {
		console.log('save button clicked');
		
		file_commands.saveCommand({}, {
			done: function() { console.log('Save.request.done(', arguments, ')'); },
			async: function() { console.log('Save.request.async(', arguments, ')'); }
		});
	}
}


exports.PositionIndicator = function PositionIndicator() {
    this.element = document.createElement('li');
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

exports.Logo = Logo;
