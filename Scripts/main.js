"use strict";

exports.activate = function() {
    // Do work when the extension is activated
};

exports.deactivate = function() {
    // Clean up state before the extension is deactivated
};

nova.commands.register("maxgrafik.QuickDocs.show", editor => {

    let cursorPosition = editor.selectedRange.start;
    const lineRange = editor.getLineRangeForRange(
        new Range(cursorPosition, cursorPosition)
    );

    const line = editor.getTextInRange(lineRange);

    if (line.trim() === "") {
        return;
    }

    cursorPosition -= lineRange.start;

    if (editor.document.syntax === "html") {

        // HTML

        const regex = /<\/?(?<tag>[A-Za-z-]+)/g;

        let key = null;

        const matches = [...line.matchAll(regex)];
        for (const match of matches) {
            if (cursorPosition >= match.index && cursorPosition <= (match.index + match[0].length)) {
                key = match.groups.tag.toLowerCase();
                break;
            }
        }

        if (key) {
            key = (key === "h") ? "heading_elements" : key;
            getDefinition("html", key);
        }

    } else if (editor.document.syntax === "css") {

        // CSS

        const propertyRegex = /(?<prop>[a-z-]+)(?::|\s)/g;
        const atRuleRegex   = /(?<at>@[a-z-]+)(?:\s|\{)/g;
        const pseudoRegex   = /:{1,2}(?<pseudo>[a-z-]+)/g;

        const propertyMatch = [...line.matchAll(propertyRegex)];
        const atRuleMatch   = [...line.matchAll(atRuleRegex)];
        const pseudoMatch   = [...line.matchAll(pseudoRegex)];

        let file = null;
        let key = null;

        const matches = [].concat(atRuleMatch, pseudoMatch, propertyMatch);

        for (const match of matches) {
            if (cursorPosition >= match.index && cursorPosition <= (match.index + match[0].length)) {
                key = match.groups.at || match.groups.pseudo || match.groups.prop;
                const c = match[0].charAt(0);
                file = (c === "@")
                    ? "css-at-rules"
                    : (
                        (c === ":")
                            ? "css-pseudo"
                            : "css"
                    );
                break;
            }
        }

        if (file && key) {
            getDefinition(file, key);
        }
    }
});

nova.commands.register("maxgrafik.QuickDocs.search", editor => {

    let docs = [];

    if (editor.document.syntax === "html") {
        const html = require("./docs/html.json");
        const htmlAttr = require("./docs/html-attr.json");
        const htmlGlob = require("./docs/html-glob.json");
        docs = Object.assign({}, html, htmlAttr, htmlGlob);

    } else if (editor.document.syntax === "css") {
        const css = require("./docs/css.json");
        const cssAtRules = require("./docs/css-at-rules.json");
        const cssPseudo = require("./docs/css-pseudo.json");
        docs = Object.assign({}, css, cssAtRules, cssPseudo);
    }

    const choices = [];
    const keys = Object.keys(docs);
    for (const key of keys) {
        choices.push(docs[key].title);
    }

    choices.sort();

    nova.workspace.showChoicePalette(choices, {placeholder: "Search Quick Docs"}, (choice) => {
        for (const key of keys) {
            if (docs[key].title === choice) {
                showNotification(docs[key]);
                break;
            }
        }
    });
});

function getDefinition(file, key) {
    const doc = require("./docs/" + file + ".json");
    const def = doc[key];
    if (def) {
        showNotification(def);
    }
}

function showNotification(def) {
    let summary = def.summary;
    if (def.values) {
        summary = summary + "\n\nValues:\n" + def.values.join(" | ");
    }

    const request = new NotificationRequest();
    request.title = def.title;
    request.body = summary + "\n";
    request.actions = ["Read more", "OK"];

    const promise = nova.notifications.add(request);
    promise.then(reply => {
        if (reply.actionIdx === 0) {
            nova.openURL(def.url);
        }
    }, error => {
        console.error(error);
    });
}
