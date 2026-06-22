function notifyExtension() {
    // send a message that the content should be clipped
    browser.runtime.sendMessage({ type: "clip", dom: content});
}

function getHTMLOfDocument() {
    // make sure a title tag exists so that pageTitle is not empty and
    // a filename can be genarated.
    if (document.head.getElementsByTagName('title').length == 0) {
        let titleEl = document.createElement('title');
        // prepate a good default text (the text displayed in the window title)
        titleEl.innerText = document.title;
        document.head.append(titleEl);
    }

    // if the document doesn't have a "base" element make one
    // this allows the DOM parser in future steps to fix relative uris

    let baseEls = document.head.getElementsByTagName('base');
    let baseEl;

    if (baseEls.length > 0) {
        baseEl = baseEls[0];
    } else {
        baseEl = document.createElement('base');
        document.head.append(baseEl);
    }

    // make sure the 'base' element always has a good 'href`
    // attribute so that the DOMParser generates usable
    // baseURI and documentURI properties when used in the
    // background context.

    let href = baseEl.getAttribute('href');

    if (!href || !href.startsWith(window.location.origin)) {
        baseEl.setAttribute('href', window.location.href);
    }

    // remove the hidden content from the page
    removeHiddenNodes(document.body);

    // get the content of the page as a string
    return document.documentElement.outerHTML;
}

function ensureDocumentMetadata(targetDocument) {
    const targetHead = targetDocument.head || targetDocument.querySelector('head');
    if (!targetHead) {
        return;
    }

    if (targetHead.getElementsByTagName('title').length == 0) {
        let titleEl = targetDocument.createElement('title');
        titleEl.innerText = document.title;
        targetHead.append(titleEl);
    }

    let baseEls = targetHead.getElementsByTagName('base');
    let baseEl;

    if (baseEls.length > 0) {
        baseEl = baseEls[0];
    } else {
        baseEl = targetDocument.createElement('base');
        targetHead.append(baseEl);
    }

    let href = baseEl.getAttribute('href');

    if (!href || !href.startsWith(window.location.origin)) {
        baseEl.setAttribute('href', window.location.href);
    }
}

function removeHiddenNodesFromClone(root, sourceRoot) {
    const clonedNodes = Array.from(root.querySelectorAll('*'));
    const sourceNodes = Array.from(sourceRoot.querySelectorAll('*'));
    const nodesToRemove = [];

    sourceNodes.forEach((node, index) => {
      let nodeName = node.nodeName.toLowerCase();
      if (nodeName === "script" || nodeName === "style" || nodeName === "noscript" || nodeName === "math") {
        nodesToRemove.push(clonedNodes[index]);
        return;
      }
      if (node.offsetParent === void 0) {
        return;
      }
      let computedStyle = window.getComputedStyle(node, null);
      if (computedStyle.getPropertyValue("visibility") === "hidden" || computedStyle.getPropertyValue("display") === "none") {
        nodesToRemove.push(clonedNodes[index]);
      }
    });

    nodesToRemove.forEach(node => node?.remove());
    return root
}

function normalizeChatGptCodeBlocks(root, targetDocument) {
    root.querySelectorAll('button').forEach(button => {
        const label = button.textContent.trim();
        if (label === 'Copy code' || label === 'Edit') {
            button.remove();
        }
    });

    root.querySelectorAll('pre').forEach(pre => {
        if (!pre.firstElementChild || pre.firstElementChild.nodeName !== 'CODE') {
            const code = targetDocument.createElement('code');
            code.textContent = pre.textContent;
            pre.innerHTML = '';
            pre.appendChild(code);
        }
    });

    root.querySelectorAll('code').forEach(code => {
        if (code.parentElement?.nodeName === 'PRE') {
            return;
        }

        const parentText = code.parentElement?.textContent?.trim() || '';
        const codeText = code.textContent.trim();
        if (!codeText) {
            return;
        }

        const looksLikeStandaloneBlock = parentText === codeText || codeText.includes('\n');
        if (looksLikeStandaloneBlock) {
            const pre = targetDocument.createElement('pre');
            const wrappedCode = targetDocument.createElement('code');
            wrappedCode.textContent = codeText;
            pre.appendChild(wrappedCode);
            code.parentElement.replaceWith(pre);
        }
    });
}

function getHTMLOfChatGptDocument() {
    const mainSource = document.querySelector('main');
    if (!mainSource) {
        return getHTMLOfDocument();
    }

    const sanitizedDocument = document.implementation.createHTMLDocument(document.title);
    ensureDocumentMetadata(sanitizedDocument);

    const mainClone = mainSource.cloneNode(true);
    removeHiddenNodesFromClone(mainClone, mainSource);

    mainClone.querySelectorAll('script, style, noscript').forEach(node => node.remove());
    mainClone.querySelectorAll('nav, aside, footer').forEach(node => node.remove());
    mainClone.querySelectorAll('[role="navigation"], [data-testid*="sidebar"]').forEach(node => node.remove());
    mainClone.querySelectorAll('textarea, [contenteditable="true"], [data-testid*="composer"], form').forEach(node => {
        if (node.querySelector('textarea, [contenteditable="true"]')) {
            node.remove();
        }
    });
    mainClone.querySelectorAll('svg').forEach(node => {
        if (!node.textContent.trim()) {
            node.remove();
        }
    });
    normalizeChatGptCodeBlocks(mainClone, sanitizedDocument);

    sanitizedDocument.body.innerHTML = '';
    sanitizedDocument.body.appendChild(mainClone);

    return sanitizedDocument.documentElement.outerHTML;
}

// code taken from here: https://www.reddit.com/r/javascript/comments/27bcao/anyone_have_a_method_for_finding_all_the_hidden/
function removeHiddenNodes(root) {
    let nodeIterator, node,i = 0;

    nodeIterator = document.createNodeIterator(root, NodeFilter.SHOW_ELEMENT, function(node) {
      let nodeName = node.nodeName.toLowerCase();
      if (nodeName === "script" || nodeName === "style" || nodeName === "noscript" || nodeName === "math") {
        return NodeFilter.FILTER_REJECT;
      }
      if (node.offsetParent === void 0) {
        return NodeFilter.FILTER_ACCEPT;
      }
      let computedStyle = window.getComputedStyle(node, null);
      if (computedStyle.getPropertyValue("visibility") === "hidden" || computedStyle.getPropertyValue("display") === "none") {
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    while ((node = nodeIterator.nextNode()) && ++i) {
      if (node.parentNode instanceof HTMLElement) {
        node.parentNode.removeChild(node);
      }
    }
    return root
  }

// code taken from here: https://stackoverflow.com/a/5084044/304786
function getHTMLOfSelection() {
    var range;
    if (document.selection && document.selection.createRange) {
        range = document.selection.createRange();
        return range.htmlText;
    } else if (window.getSelection) {
        var selection = window.getSelection();
        if (selection.rangeCount > 0) {
            let content = '';
            for (let i = 0; i < selection.rangeCount; i++) {
                range = selection.getRangeAt(0);
                var clonedSelection = range.cloneContents();
                var div = document.createElement('div');
                div.appendChild(clonedSelection);
                content += div.innerHTML;
            }
            return content;
        } else {
            return '';
        }
    } else {
        return '';
    }
}

function getSelectionAndDom(options = {}) {
    const extractionOptions = typeof options === "object" && options !== null ? options : {};
    return {
        selection: getHTMLOfSelection(),
        dom: extractionOptions.chatgptMode ? getHTMLOfChatGptDocument() : getHTMLOfDocument()
    }
}

// This function must be called in a visible page, such as a browserAction popup
// or a content script. Calling it in a background page has no effect!
function copyToClipboard(text) {
    navigator.clipboard.writeText(text);
}

function downloadMarkdown(filename, text) {
    let datauri = `data:text/markdown;base64,${text}`;
    var link = document.createElement('a');
    link.download = filename;
    link.href = datauri;
    link.click();
}

function downloadImage(filename, url) {

    /* Link with a download attribute? CORS says no.
    var link = document.createElement('a');
    link.download = filename.substring(0, filename.lastIndexOf('.'));
    link.href = url;
    console.log(link);
    link.click();
    */

    /* Try via xhr? Blocked by CORS.
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'blob';
    xhr.onload = () => {
        console.log('onload!')
        var file = new Blob([xhr.response], {type: 'application/octet-stream'});
        var link = document.createElement('a');
        link.download = filename;//.substring(0, filename.lastIndexOf('.'));
        link.href = window.URL.createObjectURL(file);
        console.log(link);
        link.click();
    }
    xhr.send();
    */

    /* draw on canvas? Inscure operation
    let img = new Image();
    img.src = url;
    img.onload = () => {
        let canvas = document.createElement("canvas");
        let ctx = canvas.getContext("2d");
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        var link = document.createElement('a');
        const ext = filename.substring(filename.lastIndexOf('.'));
        link.download = filename;
        link.href = canvas.toDataURL(`image/png`);
        console.log(link);
        link.click();
    }
    */
}

(function loadPageContextScript(){
    var s = document.createElement('script');
    s.src = browser.runtime.getURL('contentScript/pageContext.js');
    (document.head||document.documentElement).appendChild(s);
})()
