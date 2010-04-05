/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1
 *
 * The contents of this file are subject to the Mozilla Public License
 * Version 1.1 (the "License"); you may not use this file except in
 * compliance with the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS"
 * basis, WITHOUT WARRANTY OF ANY KIND, either express or implied.
 * See the License for the specific language governing rights and
 * limitations under the License.
 *
 * The Original Code is Bespin.
 *
 * The Initial Developer of the Original Code is Mozilla.
 * Portions created by the Initial Developer are Copyright (C) 2009
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Bespin Team (bespin@mozilla.com)
 *
 * ***** END LICENSE BLOCK ***** */

var SC = require("sproutcore/runtime").SC;
var console = require('bespin:console').console;
var util = require("bespin:util/util");
var m_promise = require("bespin:promise");

var pathUtil = require("filesystem:path");

var Promise = m_promise.Promise;

// Does a binary search on a sorted array, returning
// the *first* index in the array with the prefix
exports._prefixSearch = function(arr, find) {
    var low = 0;
    var high = arr.length - 1;
    var findlength = find.length;
    var i;
    var lowmark = null;
    var sub;
    
    while (low <= high) {
        i = parseInt((low + high) / 2, 10);
        sub = arr[i].substring(0, findlength);
        if (i == lowmark) {
            return i;
        }
        
        if (sub == find) {
            lowmark = i;
            high = i - 1;
        } else {
            if (sub < find) {
                low = i + 1;
            } else {
                high = i - 1;
            }
        }
    }
    return lowmark;
};

// Standard binary search
exports._binarySearch = function(arr, find) {
    var low = 0;
    var high = arr.length - 1;
    var i;
    var current;
    
    while (low <= high) {
        i = parseInt((low + high) / 2, 10);
        current = arr[i];
        if (current < find) {
            low = i + 1;
        } else if (current > find) {
            high = i - 1;
        } else {
            return i;
        }
    }
    return null;
};

exports.NEW = { name: "NEW" };
exports.LOADING = { name: "LOADING" };
exports.READY = { name: "READY" };

exports.Filesystem = SC.Object.extend({
    // FileSource for this filesytem
    source: null,
    
    // list of filenames
    _files: null,
    
    status: exports.NEW,
    _loadingPromises: null,
    
    init: function() {
        var source = this.get("source");
        if (typeof(source) == "string") {
            this.set("source", SC.objectForPropertyPath(source));
        }

        if (!this.get("source")) {
            throw new Error("Directory must have a source.");
        }
        
        this._loadingPromises = [];
    },
    
    _load: function() {
        var pr = new Promise();
        if (this.status === exports.READY) {
            pr.resolve();
        } else if (this.status === exports.LOADING) {
            this._loadingPromises.push(pr);
        } else {
            this.set("status", exports.LOADING);
            this._loadingPromises.push(pr);
            this.get("source").loadAll().then(this._fileListReceived.bind(this));
        }
        return pr;
    },
    
    _fileListReceived: function(filelist) {
        filelist.sort();
        this._files = filelist;
        this.set("status", exports.READY);
        var lp = this._loadingPromises;
        while (lp.length > 0) {
            var pr = lp.pop();
            pr.resolve();
        }
    },
    
    /*
     * Get a list of all files in the filesystem.
     */
    listAll: function() {
        return this._load().then(function() {
            return this._files;
        }.bind(this));
    },
    
    /*
     * Loads the contents of the file at path. When the promise is
     * resolved, the contents are passed in.
     */
    loadContents: function(path) {
        path = pathUtil.trimLeadingSlash(path);
        var source = this.get("source");
        return source.loadContents(path);
    },
    
    /*
     * Save a contents to the path provided. If the file does not
     * exist, it will be created.
     */
    saveContents: function(path, contents) {
        var pr = new Promise();
        path = pathUtil.trimLeadingSlash(path);
        var source = this.get("source");
        var self = this;
        source.saveContents(path, contents).then(function() {
            self.exists(path).then(function(exists) {
                if (!exists) {
                    self._files.push(path);
                    self._files.sort();
                }
                pr.resolve();
            });
        });
        return pr;
    },
    
    /*
     * get a File object that provides convenient path
     * manipulation and access to the file data.
     */
    getFile: function(path) {
        return new exports.File(this, path);
    },
    
    /*
     * Returns a promise that will resolve to true if the given path
     * exists.
     */
    exists: function(path) {
        path = pathUtil.trimLeadingSlash(path);
        var pr = new Promise();
        this._load().then(function() {
            var result = exports._binarySearch(this._files, path);
            pr.resolve(result !== null);
        }.bind(this));
        return pr;
    },
    
    /*
     * Deletes the file or directory at a path.
     */
    remove: function(path) {
        path = pathUtil.trimLeadingSlash(path);
        var pr = new Promise();
        var self = this;
        var source = this.get("source");
        source.remove(path).then(function() {
            self._load().then(function() {
                var position = exports._binarySearch(self._files, path);
                if (position === null) {
                    pr.reject(new Error("Cannot find path " + path + " to remove"));
                    return;
                }
                self._files.splice(position, 1);
                pr.resolve();
            });
        });
        return pr;
    },
    
    /*
     * Lists the contents of the directory at the path provided.
     * Returns a promise that will be given a list of file 
     * and directory names for the contents of the directory.
     * Directories are distinguished by a trailing slash.
     */
    listDirectory: function(path) {
        path = pathUtil.trimLeadingSlash(path);
        var pr = new Promise();
        this._load().then(function() {
            var files = this._files;
            var index = exports._prefixSearch(files, path);
            if (index === null) {
                pr.reject(new Error('Path ' + path + ' not found.'));
                return;
            }
            var result = [];
            var numfiles = files.length;
            var pathlength = path.length;
            var lastSegment = null;
            for (var i = index; i < numfiles; i++) {
                var file = files[i];
                if (file.substring(0, pathlength) != path) {
                    break;
                }
                var segmentEnd = file.indexOf("/", pathlength) + 1;
                if (segmentEnd == 0) {
                    segmentEnd = file.length;
                }
                var segment = file.substring(pathlength, segmentEnd);
                if (segment == "") {
                    continue;
                }
                
                if (segment != lastSegment) {
                    lastSegment = segment;
                    result.push(segment);
                }
            }
            pr.resolve(result);
        }.bind(this));
        return pr;
    },
    
    /*
     * Creates a directory at the path provided. Nothing is
     * passed into the promise callback.
     */
    makeDirectory: function(path) {
        path = pathUtil.trimLeadingSlash(path);
        if (!pathUtil.isDir(path)) {
            path += "/";
        }
        
        var self = this;
        var pr = new Promise();
        this._load().then(function() {
            var source = self.get("source");
            source.makeDirectory(path).then(function() {
                self._files.push(path);
                // O(n log n), eh? but all in C so it's possible
                // that this may be quicker than binary search + splice
                self._files.sort();
                pr.resolve();
            });
        });
        return pr;
    }
});

exports.File = function(fs, path) {
    this.fs = fs;
    this.path = path;
};

exports.File.prototype = {
    parentdir: function() {
        return pathUtil.parentdir(this.path);
    },
    
    loadContents: function() {
        return this.fs.loadContents(this.path);
    },
    
    saveContents: function(contents) {
        return this.fs.saveContents(this.path, contents);
    },
    
    exists: function() {
        return this.fs.exists(this.path);
    },
    
    remove: function() {
        return this.fs.remove(this.path);
    },
    
    extension: function() {
        return pathUtil.fileType(this.path);
    }
};