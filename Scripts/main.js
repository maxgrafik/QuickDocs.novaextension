"use strict";

let MDNSearchIndex = null;

exports.activate = function() {

    /**
     * Read MDN search index from disk (if available)
     * or load fresh copy from developer.mozilla.org
     */

    try {
        const filePath = nova.path.join(nova.fs.tempdir, "MDNSearchIndex.json");
        const fileStat = nova.fs.stat(filePath);

        if (
            nova.fs.access(filePath, nova.fs.F_OK + nova.fs.R_OK) &&
            fileStat.isFile() &&
            fileStat.mtime.getTime() > (Date.now() - (24*60*60*1000))
        ) {
            console.log("Reading MDN search index from disk ...");
            const fileObj = nova.fs.open(filePath, "r");
            const data = fileObj.read();
            fileObj.close();
            MDNSearchIndex = JSON.parse(data);

        } else {
            console.log("Fetching MDN search index ...");
            fetch("https://developer.mozilla.org/en-US/search-index.json")
                .then((response) => response.text())
                .then(text => {
                    const fileObj = nova.fs.open(filePath, "w");
                    fileObj.write(text);
                    fileObj.close();
                    MDNSearchIndex = JSON.parse(text);
                });
        }
    } catch (error) {
        console.log(error);
    }
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
            key = (key === "h") ? "h1" : key;
            getDefinition("html", key);
        }

    } else if (editor.document.syntax === "css") {

        // CSS

        const propertyRegex = /(?<prop>[a-z-]+)(?::|\s)/g;
        const atRuleRegex   = /(?<at>@[a-z-]+)(?:\s|\{)/g;
        const pseudoRegex   = /(?<pseudo>:{1,2}[a-z-]+)/g;

        const propertyMatch = [...line.matchAll(propertyRegex)];
        const atRuleMatch   = [...line.matchAll(atRuleRegex)];
        const pseudoMatch   = [...line.matchAll(pseudoRegex)];

        let key = null;

        const matches = [].concat(atRuleMatch, pseudoMatch, propertyMatch);
        for (const match of matches) {
            if (cursorPosition >= match.index && cursorPosition <= (match.index + match[0].length)) {
                key = match.groups.at || match.groups.pseudo || match.groups.prop;
                break;
            }
        }

        if (key) {
            getDefinition("css", key);
        }

    } else if (editor.document.syntax === "javascript") {
        searchMDN();
    }
});

nova.commands.register("maxgrafik.QuickDocs.searchMDN", () => {
    searchMDN();
});

function searchMDN() {
    if (MDNSearchIndex) {
        nova.workspace.showChoicePalette(
            MDNSearchIndex.map(entry => entry.title),
            {placeholder: "Search MDN"},
            (choice) => {
                for (const entry of MDNSearchIndex) {
                    if (entry.title === choice && entry.url) {
                        nova.openURL("https://developer.mozilla.org" + entry.url);
                        break;
                    }
                }
            });
    } else {
        console.log("Error reading MDN search index");
    }
}

function getDefinition(file, key) {

    if (!MDNSearchIndex) {
        console.log("Error reading MDN search index");
        return;
    }

    if (file === "html") {
        for (const entry of MDNSearchIndex) {
            if (
                entry.title.startsWith("<"+key+">") &&
                entry.url
            ) {
                nova.openURL("https://developer.mozilla.org" + entry.url);
                return;
            }
        }

    } else if (file === "css") {
        for (const entry of MDNSearchIndex) {
            if (
                entry.title.startsWith(key) &&
                entry.url &&
                entry.url.startsWith("/en-US/docs/Web/CSS/")
            ) {
                nova.openURL("https://developer.mozilla.org" + entry.url);
                return;
            }
        }
    }

    // if all fails, show search palette
    searchMDN();
}
