"use strict";

let MDNSearchIndex = null;
let PHPSearchIndex = null;

exports.activate = function() {

    getSearchIndex("MDN", 1).then((data) => {
        MDNSearchIndex = data;
    });

    getSearchIndex("PHP", 14).then((data) => {
        PHPSearchIndex = data;
    });
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
        // Nothing to search for -> show search palette
        if (editor.document.syntax === "php") {
            searchPHP();
        } else {
            searchMDN();
        }
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
        } else {
            // Nothing to search for -> show search palette
            searchMDN();
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
        } else {
            // Nothing to search for -> show search palette
            searchMDN();
        }

    } else if (editor.document.syntax === "javascript") {

        // JavaScript -> show search palette
        searchMDN();

    } else if (editor.document.syntax === "php") {

        // PHP -> show search palette
        searchPHP();
    }
});

nova.commands.register("maxgrafik.QuickDocs.search", editor => {
    if (editor.document.syntax === "php") {
        searchPHP();
    } else {
        searchMDN();
    }
});


function searchMDN() {
    if (
        typeof MDNSearchIndex === "object" &&
        MDNSearchIndex !== null
    ) {
        nova.workspace.showChoicePalette(
            MDNSearchIndex.map(entry => entry.title),
            {placeholder: "Search developer.mozilla.org"},
            (choice) => {
                for (const entry of MDNSearchIndex) {
                    if (entry.title === choice && entry.url) {
                        nova.openURL("https://developer.mozilla.org" + entry.url);
                        break;
                    }
                }
            });
    } else {
        nova.workspace.showErrorMessage("MDN search not available. See log for more info.");
    }
}

function searchPHP() {
    if (
        typeof PHPSearchIndex === "object" &&
        PHPSearchIndex !== null
    ) {
        const choices = [];
        for (const value of Object.values(PHPSearchIndex)) {
            //choices.push(value[0] + " • " + value[1]);
            choices.push(value[0]);
        }

        choices.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

        nova.workspace.showChoicePalette(
            choices,
            {placeholder: "Search PHP.net"},
            (choice) => {
                for (const [key, value] of Object.entries(PHPSearchIndex)) {
                    //if (choice === (value[0] + " • " + value[1])) {
                    if (choice === value[0]) {
                        nova.openURL("https://www.php.net/manual/en/" + key);
                        break;
                    }
                }
            });
    } else {
        nova.workspace.showErrorMessage("PHP search not available. See log for more info.");
    }
}

function getDefinition(file, key) {

    if (
        typeof MDNSearchIndex !== "object" ||
        MDNSearchIndex === null
    ) {
        nova.workspace.showErrorMessage("MDN search not available. See log for more info.");
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

    // If all fails -> show search palette
    searchMDN();
}

async function getSearchIndex(source, lifetime) {

    /**
     * Read search index from disk (if available)
     * or load fresh copy from web
     */

    let searchIndex = null;
    let url = null;

    switch(source) {
    case "MDN":
        url = "https://developer.mozilla.org/en-US/search-index.json";
        break;
    case "PHP":
        url = "https://www.php.net/js/search-index.php?lang=en";
        break;
    }

    const filePath = nova.path.join(nova.fs.tempdir, source + ".json");
    const fileStat = nova.fs.stat(filePath);

    if (nova.fs.access(filePath, nova.fs.F_OK + nova.fs.R_OK) && fileStat.isFile()) {

        // Always try to read local copy first, if possible

        const fileObj = nova.fs.open(filePath, "r");
        const data = fileObj.read();
        fileObj.close();

        try {
            searchIndex = JSON.parse(data);
        } catch (error) {
            console.log(error);
        }

        // Data valid and still fresh?

        if (
            typeof searchIndex === "object" &&
            searchIndex !== null &&
            fileStat.mtime.getTime() > (Date.now() - (lifetime*24*60*60*1000))
        ) {
            console.log(source + " search available (cached)");
            return Promise.resolve(searchIndex);
        }
    }

    // Get fresh copy

    console.log("Fetching search index ...");

    await fetch(url)
        .then((response) => {

            if (response.ok) {
                return response.text();
            }

            throw new Error("Fetching search index failed. Status: " + response.statusText);

        })
        .then((text) => {

            const data = JSON.parse(text);

            if (
                typeof data === "object" &&
                data !== null
            ) {
                const fileObj = nova.fs.open(filePath, "w");
                fileObj.write(text);
                fileObj.close();

                searchIndex = data;

                console.log(source + " search available");

            } else {
                throw new Error("Received invalid data");
            }

        })
        .catch((error) => {

            console.log(error);

            // Do we have a local copy?

            if (
                typeof searchIndex === "object" &&
                searchIndex !== null
            ) {
                console.log("Using local copy. Last update: " + fileStat.mtime.toLocaleString());
            } else {
                console.log(source + " search not available");
            }
        });

    return Promise.resolve(searchIndex);
}
