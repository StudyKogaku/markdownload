
// default variables
var selectedText = null;
var imageList = null;
var mdClipsFolder = '';

const darkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
// set up event handlers
const cm = CodeMirror.fromTextArea(document.getElementById("md"), {
    theme: darkMode ? "xq-dark" : "xq-light",
    mode: "markdown",
    lineWrapping: true
});
cm.on("cursorActivity", (cm) => {
    const somethingSelected = cm.somethingSelected();
    var selectionActionButtons = document.getElementById("selectionActionButtons");

    // 変更: 選択範囲がある場合はダウンロードとコピーの両方の選択範囲用ボタンを表示する
    if (somethingSelected) {
        if(selectionActionButtons.style.display != "flex") selectionActionButtons.style.display = "flex";
    }
    else {
        if(selectionActionButtons.style.display != "none") selectionActionButtons.style.display = "none";
    }
});
document.getElementById("download").addEventListener("click", download);
document.getElementById("downloadSelection").addEventListener("click", downloadSelection);
// 変更: popup上のMarkdown本文をクリップボードへコピーするボタンを追加
document.getElementById("copy").addEventListener("click", copy);
document.getElementById("copySelection").addEventListener("click", copySelection);

const defaultOptions = {
    includeTemplate: false,
    clipSelection: true,
    clipFullPage: false,
    downloadImages: false
}

const checkInitialSettings = options => {
    if (options.includeTemplate)
        document.querySelector("#includeTemplate").classList.add("checked");

    if (options.downloadImages)
        document.querySelector("#downloadImages").classList.add("checked");

    if (options.clipSelection)
        document.querySelector("#selected").classList.add("checked");
    else if (options.clipFullPage)
        document.querySelector("#fullPage").classList.add("checked");
    else
        document.querySelector("#document").classList.add("checked");
}

// 変更: 選択範囲・記事・ページ全体を排他的に切り替える
const setClipMode = (options, mode) => {
    options.clipSelection = mode === "selection";
    options.clipFullPage = mode === "fullPage";
    document.querySelector("#selected").classList.toggle("checked", options.clipSelection);
    document.querySelector("#document").classList.toggle("checked", mode === "article");
    document.querySelector("#fullPage").classList.toggle("checked", options.clipFullPage);
    browser.storage.sync.set(options).then(() => clipSite()).catch((error) => {
        console.error(error);
    });
}

const toggleIncludeTemplate = options => {
    options.includeTemplate = !options.includeTemplate;
    document.querySelector("#includeTemplate").classList.toggle("checked");
    browser.storage.sync.set(options).then(() => {
        browser.contextMenus.update("toggle-includeTemplate", {
            checked: options.includeTemplate
        });
        try {
            browser.contextMenus.update("tabtoggle-includeTemplate", {
                checked: options.includeTemplate
            });
        } catch { }
        return clipSite()
    }).catch((error) => {
        console.error(error);
    });
}

const toggleDownloadImages = options => {
    options.downloadImages = !options.downloadImages;
    document.querySelector("#downloadImages").classList.toggle("checked");
    browser.storage.sync.set(options).then(() => {
        browser.contextMenus.update("toggle-downloadImages", {
            checked: options.downloadImages
        });
        try {
            browser.contextMenus.update("tabtoggle-downloadImages", {
                checked: options.downloadImages
            });
        } catch { }
    }).catch((error) => {
        console.error(error);
    });
}
const showOrHideClipOption = selection => {
    // 変更: ArticleとFull Pageは常に選べるようにし，選択範囲ボタンだけを切り替える
    document.getElementById("clipOption").style.display = "flex";
    document.getElementById("selected").style.display = selection ? "inline-block" : "none";
}

const clipSite = (id) => {
    return browser.storage.sync.get(defaultOptions).then(options => {
        return browser.tabs.executeScript(id, { code: "getSelectionAndDom()" })
            .then((result) => {
                if (result && result[0]) {
                    showOrHideClipOption(result[0].selection);
                    let message = {
                        type: "clip",
                        dom: result[0].dom,
                        selection: result[0].selection
                    }
                    browser.runtime.sendMessage({
                        ...message,
                        ...options
                    });
                }
            }).catch(err => {
                console.error(err);
                showError(err);
            });
    }).catch(err => {
        console.error(err);
        showError(err);
        return browser.tabs.executeScript(id, { code: "getSelectionAndDom()" })
            .then((result) => {
                if (result && result[0]) {
                    showOrHideClipOption(result[0].selection);
                    let message = {
                        type: "clip",
                        dom: result[0].dom,
                        selection: result[0].selection
                    };
                    return browser.runtime.sendMessage({
                        ...message,
                        ...defaultOptions
                    });
                }
            }).catch(fallbackErr => {
                console.error(fallbackErr);
                showError(fallbackErr);
            });
    });
}

// inject the necessary scripts
browser.storage.sync.get(defaultOptions).then(options => {
    checkInitialSettings(options);
    
    document.getElementById("selected").addEventListener("click", (e) => {
        e.preventDefault();
        setClipMode(options, "selection");
    });
    document.getElementById("document").addEventListener("click", (e) => {
        e.preventDefault();
        setClipMode(options, "article");
    });
    document.getElementById("fullPage").addEventListener("click", (e) => {
        e.preventDefault();
        setClipMode(options, "fullPage");
    });
    document.getElementById("includeTemplate").addEventListener("click", (e) => {
        e.preventDefault();
        toggleIncludeTemplate(options);
    });
    document.getElementById("downloadImages").addEventListener("click", (e) => {
        e.preventDefault();
        toggleDownloadImages(options);
    });
    
    return browser.tabs.query({
        currentWindow: true,
        active: true
    });
}).then((tabs) => {
    var id = tabs[0].id;
    var url = tabs[0].url;
    browser.tabs.executeScript(id, {
        file: "/browser-polyfill.min.js"
    })
    .then(() => {
        return browser.tabs.executeScript(id, {
            file: "/contentScript/contentScript.js"
        });
    }).then( () => {
        console.info("Successfully injected MarkDownload content script");
        return clipSite(id);
    }).catch( (error) => {
        console.error(error);
        showError(error);
    });
});

// listen for notifications from the background page
browser.runtime.onMessage.addListener(notify);

//function to send the download message to the background page
function sendDownloadMessage(text) {
    if (text != null) {

        return browser.tabs.query({
            currentWindow: true,
            active: true
        }).then(tabs => {
            var message = {
                type: "download",
                markdown: text,
                title: document.getElementById("title").value,
                tab: tabs[0],
                imageList: imageList,
                mdClipsFolder: mdClipsFolder
            };
            return browser.runtime.sendMessage(message);
        });
    }
}

// event handler for download button
async function download(e) {
    e.preventDefault();
    await sendDownloadMessage(cm.getValue());
    window.close();
}

// event handler for download selected button
async function downloadSelection(e) {
    e.preventDefault();
    if (cm.somethingSelected()) {
        await sendDownloadMessage(cm.getSelection());
    }
}

// 変更: CodeMirrorに表示されたMarkdownをクリップボードへコピーする共通処理
async function copyTextToClipboard(text, button) {
    if (text == null) return;

    const originalText = button.textContent;

    try {
        await navigator.clipboard.writeText(text);
        button.textContent = "Copied!";
        setTimeout(() => {
            button.textContent = originalText;
        }, 1500);
    }
    catch (err) {
        console.error(err);
        button.textContent = "Copy failed";
        setTimeout(() => {
            button.textContent = originalText;
        }, 1500);
    }
}

async function copy(e) {
    e.preventDefault();
    await copyTextToClipboard(cm.getValue(), e.currentTarget);
}

async function copySelection(e) {
    e.preventDefault();
    if (cm.somethingSelected()) {
        await copyTextToClipboard(cm.getSelection(), e.currentTarget);
    }
}

//function that handles messages from the injected script into the site
function notify(message) {
    // message for displaying markdown
    if (message.type == "display.md") {

        // set the values from the message
        //document.getElementById("md").value = message.markdown;
        cm.setValue(message.markdown);
        document.getElementById("title").value = message.article.title;
        imageList = message.imageList;
        mdClipsFolder = message.mdClipsFolder;
        
        // show the hidden elements
        document.getElementById("container").style.display = 'flex';
        document.getElementById("spinner").style.display = 'none';
         // focus the download button
        document.getElementById("download").focus();
        cm.refresh();
    }
}

function showError(err) {
    // show the hidden elements
    document.getElementById("container").style.display = 'flex';
    document.getElementById("spinner").style.display = 'none';
    cm.setValue(`Error clipping the page\n\n${err}`)
}
