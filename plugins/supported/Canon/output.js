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

var SC = require("sproutcore/runtime").SC;

/**
 * TODO: Consider if this is actually the best way to tell the world about the
 * created Output objects...
 */
exports.history = SC.Object.create({
    invocations: []
});

/**
 * To create an invocation, you need to do something like this (all the ctor
 * args are optional):
 * <pre>
 * var invocation = Invocation.create({
 *     command: command,
 *     commandExt: commandExt,
 *     args: args,
 *     typed: typed
 * });
 * </pre>
 */
exports.Invocation = SC.Object.extend({
    // Will be used in the keyboard case and the cli case
    command: null,
    commandExt: null,

    // Will be used only in the cli case
    args: {},
    typed: null,

    // Stuff we keep track of
    outputs: [],
    start: new Date(),
    end: null,
    duration: null,
    completed: false,
    error: false,

    /**
     * Nastiness to get around sproutcore size problem
     */
    _hack: "",

    /**
     * Have we been initialized?
     */
    _inited: false,

    /**
     * Lazy init to register with the history should only be done on output.
     * Init is expensive, and won't be used in the majority of cases
     */
    _init: function() {
        this.set("_inited", true);
        exports.history.invocations.pushObject(this);
    },

    /**
     * Sugar for:
     * <pre>output.set("error", true).done(output);</pre>
     * Which is in turn sugar for:
     * <pre>output.set("error", true).output(output).done();</pre>
     */
    doneWithError: function(content) {
        this.set("error", true).done(content);
    },

    /**
     * Complete the currently executing command with successful output.
     * @param output Either DOM node, an SproutCore element or something that
     * can be used in the content of a DIV to create a DOM node.
     */
    output: function(content) {
        if (!this.get("_inited")) {
            this._init();
        }

        // Nasty hack that we'll get rid of as soon as we understand SC
        var hack = this.get("_hack");
        if (typeof content == "string") {
            this.set("_hack", hack + content + "<br/>");
        } else {
            this.set("_hack", hack + content.innerHTML + "<br/>");
        }

        this.outputs.push(content);
        return this;
    },

    /**
     * All commands that do output must call this to indicate that the command
     * has finished execution.
     */
    done: function(content) {
        if (content) {
            this.output(content);
        }
        this.set("completed", true);
        this.set("end", new Date());
        this.set("duration", this.get("end").getTime() - this.get("start").getTime());
    }
});
