class WysiwygEditor {
    constructor(options) {
        this.options = options;
        this.wysiwygToggle = document.getElementById(options.toggleId);
        this.rawEditor = document.getElementById(options.rawEditorId);
        this.wysiwygEditor = document.getElementById(options.wysiwygEditorId);
        this.paletteContainer = document.getElementById(options.paletteId);
        this.customColorPicker = document.getElementById(options.customColorPickerId);
        this.recentColorsContainer = document.getElementById(options.recentColorsContainerId);
        this.delaySelect = document.getElementById(options.delaySelectId);
        this.delayInsertBtn = document.getElementById(options.delayInsertBtnId);
        this.effectSelect = document.getElementById(options.effectSelectId);
        this.effectInsertBtn = document.getElementById(options.effectInsertBtnId);

        this.onUpdate = options.onUpdate || (() => {});

        this.savedSelectionRange = null;
        this.isLiveUpdatingColor = false;
        this.RECENT_COLORS_KEY = 'wysiwyg-recent-colors';
        this.MAX_RECENT_COLORS = 4;
        this.isMobile = /Mobi|Android/i.test(navigator.userAgent);

        this.COLOR_MAP = {
            'R': { name: 'Red', hex: '#ff5555' },
            'Y': { name: 'Yellow', hex: '#ffff00' },
            'B': { name: 'Blue', hex: '#0000ff' },
            'G': { name: 'Green', hex: '#00ff00' },
            'P': { name: 'Purple', hex: '#800080' },
            'O': { name: 'Orange', hex: '#ffa040' },
            'W': { name: 'White', hex: '#ffffff' }
        };

        this.REVERSE_COLOR_MAP = Object.entries(this.COLOR_MAP).reduce((acc, [key, value]) => {
            acc[value.hex] = key;
            return acc;
        }, {});

        this.init();
    }

    insertRawText(text) {
        const textarea = this.rawEditor;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        textarea.value = textarea.value.substring(0, start) + text + textarea.value.substring(end);
        textarea.selectionStart = textarea.selectionEnd = start + text.length;
        textarea.focus();
    }

    init() {
        this.createColorPalette();
        this.renderRecentColors();

        this.wysiwygToggle.addEventListener('change', () => this.toggleView());
        this.wysiwygEditor.addEventListener('input', () => this.onUpdate(this.serializeHtmlToRaw()));
        this.rawEditor.addEventListener('input', () => this.onUpdate(this.rawEditor.value));

        this.wysiwygEditor.addEventListener('mouseup', () => this.saveSelection());
        this.wysiwygEditor.addEventListener('keyup', () => this.saveSelection());

        if (this.isMobile) {
            // On mobile, save the selection on 'touchstart' before the editor loses focus.
            this.paletteContainer.addEventListener('touchstart', (e) => {
                if (e.target.classList.contains('color-swatch')) {
                    this.saveSelection();
                }
            }, { passive: true });
        }

        // Use 'click' for applying the color. It fires after touchstart/touchend.
        this.paletteContainer.addEventListener('click', (e) => {
            if (e.target.classList.contains('color-swatch')) {
                const code = e.target.dataset.code;
                if (code) {
                    this.applyColor(code);
                }
            }
        });

        this.delayInsertBtn.addEventListener('click', () => {
            if (!this.wysiwygToggle.checked) {
                this.insertRawText(this.delaySelect.value);
                this.onUpdate(this.getText());
                return;
            }
            this.wysiwygEditor.focus();
            const selectedOption = this.delaySelect.options[this.delaySelect.selectedIndex];
            const code = selectedOption.value;
            const uiText = selectedOption.text.split(' (')[0]; // Extract "Delay X" from "Delay X (YYYms)"
            this.insertHtmlAtCaret(`<span class="marker marker-delay" data-code="${code}" data-ui-text="${uiText}" contenteditable="false">&zwnj;</span>`);
            this.onUpdate(this.serializeHtmlToRaw());
        });

        if (this.effectInsertBtn) {
            this.effectInsertBtn.addEventListener('click', () => {
                if (!this.wysiwygToggle.checked) {
                    this.insertRawText(this.effectSelect.value);
                    this.onUpdate(this.getText());
                    return;
                }
                this.wysiwygEditor.focus();
                const selectedOption = this.effectSelect.options[this.effectSelect.selectedIndex];
                const code = selectedOption.value;
                const uiText = selectedOption.text;
                this.insertHtmlAtCaret(`<span class="marker marker-effect" data-code="${code}" data-ui-text="${uiText}" contenteditable="false">&zwnj;</span>`);
                this.onUpdate(this.serializeHtmlToRaw());
            });
        }
    }

    setText(rawText) {
        if (this.wysiwygToggle.checked) {
            this.wysiwygEditor.innerHTML = this.parseRawToHtml(rawText);
        } else {
            this.rawEditor.value = rawText;
        }
    }

    getText() {
        return this.wysiwygToggle.checked ? this.serializeHtmlToRaw() : this.rawEditor.value;
    }

    toggleView() {
        const isWysiwyg = this.wysiwygToggle.checked;
        if (isWysiwyg) {
            this.rawEditor.classList.add('hidden');
            this.wysiwygEditor.classList.remove('hidden');
            this.wysiwygEditor.innerHTML = this.parseRawToHtml(this.rawEditor.value);
            this.wysiwygEditor.focus();
        } else {
            this.wysiwygEditor.classList.add('hidden');
            this.rawEditor.classList.remove('hidden');
            this.rawEditor.value = this.serializeHtmlToRaw();
            this.rawEditor.focus();
        }
        this.onUpdate(this.getText());
    }

    createColorPalette() {
        for (const [code, { name, hex }] of Object.entries(this.COLOR_MAP)) {
            if (code === 'W') continue;
            const swatch = document.createElement('button');
            swatch.className = 'color-swatch';
            swatch.dataset.code = code;
            swatch.style.backgroundColor = hex;
            swatch.title = name;
            this.paletteContainer.appendChild(swatch);
        }
        const resetSwatch = document.createElement('button');
        resetSwatch.className = 'color-swatch';
        resetSwatch.dataset.code = 'W';
        resetSwatch.title = 'Reset Color';
        this.paletteContainer.appendChild(resetSwatch);

        const separator = document.createElement('div');
        separator.className = 'palette-separator';
        this.paletteContainer.appendChild(separator);

        this.paletteContainer.appendChild(this.recentColorsContainer);

        const customColorLabel = document.createElement('label');
        customColorLabel.className = 'custom-color-label';
        customColorLabel.title = 'Custom Color';
        customColorLabel.htmlFor = this.customColorPicker.id;
        this.paletteContainer.appendChild(customColorLabel);

        const LIVE_TARGET_ID = 'live-color-target';

        customColorLabel.addEventListener('mousedown', () => {
            const oldTarget = document.getElementById(LIVE_TARGET_ID);
            if (oldTarget) oldTarget.removeAttribute('id');
            this.isLiveUpdatingColor = false;
            this.saveSelection();
            const selection = window.getSelection();
            if (this.savedSelectionRange && !selection.isCollapsed) {
                const span = document.createElement('span');
                span.id = LIVE_TARGET_ID;
                try {
                    this.savedSelectionRange.surroundContents(span);
                    this.isLiveUpdatingColor = true;
                } catch (e) {
                    this.isLiveUpdatingColor = false;
                }
            }
        });

        this.customColorPicker.addEventListener('input', (e) => {
            if (this.isLiveUpdatingColor) {
                const target = document.getElementById(LIVE_TARGET_ID);
                if (target) target.style.color = e.target.value;
            }
        });

        this.customColorPicker.addEventListener('change', (e) => {
            const finalColor = e.target.value;
            if (this.isLiveUpdatingColor) {
                const target = document.getElementById(LIVE_TARGET_ID);
                if (target) target.removeAttribute('id');
                this.isLiveUpdatingColor = false;
            } else {
                this.applyColor(finalColor);
            }
            this.addRecentColor(finalColor);
            this.renderRecentColors();
            this.onUpdate(this.getText());
        });
    }

    applyColor(colorValue) {
        if (!this.wysiwygToggle.checked) {
            const textarea = this.rawEditor;
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;

            let startCode;
            if (colorValue === 'W') {
                startCode = '\\\\cW';
            } else {
                const hex = this.COLOR_MAP[colorValue]?.hex || colorValue;
                const presetCode = this.REVERSE_COLOR_MAP[hex];
                startCode = presetCode ? `\\\\c${presetCode}` : `\\\\c${hex}`;
            }

            if (start !== end) {
                // Text is selected, wrap it
                const selectedText = textarea.value.substring(start, end);
                const newText = `${startCode}${selectedText}\\\\cW`;
                textarea.value = textarea.value.substring(0, start) + newText + textarea.value.substring(end);
                textarea.selectionStart = start;
                textarea.selectionEnd = start + newText.length;
            } else {
                // No selection, just insert the code
                this.insertRawText(startCode);
            }

            this.onUpdate(this.getText());
            return;
        }
        this.restoreSelection();
        this.wysiwygEditor.focus();
        document.execCommand('styleWithCSS', false, true);
        if (colorValue === 'W') {
            document.execCommand('foreColor', false, this.COLOR_MAP['W'].hex);
        } else {
            const hex = this.COLOR_MAP[colorValue]?.hex || colorValue;
            document.execCommand('foreColor', false, hex);
        }
        this.onUpdate(this.getText());

        // After applying, clear the selection to avoid a "ghost" selection state.
        // This makes the behavior consistent with what the user sees.
        window.getSelection().removeAllRanges();
        this.savedSelectionRange = null;
    }

    saveSelection() {
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            if (this.wysiwygEditor.contains(range.commonAncestorContainer)) {
                this.savedSelectionRange = range;
            }
        }
    }

    restoreSelection() {
        if (this.savedSelectionRange) {
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(this.savedSelectionRange);
        }
    }

    getRecentColors() {
        const stored = localStorage.getItem(this.RECENT_COLORS_KEY);
        return stored ? JSON.parse(stored) : [];
    }

    saveRecentColors(colors) {
        localStorage.setItem(this.RECENT_COLORS_KEY, JSON.stringify(colors));
    }

    addRecentColor(hex) {
        let recentColors = this.getRecentColors();
        const normalizedHex = hex.toLowerCase();
        const existingIndex = recentColors.indexOf(normalizedHex);
        if (existingIndex > -1) {
            recentColors.splice(existingIndex, 1);
        }
        recentColors.unshift(normalizedHex);
        const trimmed = recentColors.slice(0, this.MAX_RECENT_COLORS);
        this.saveRecentColors(trimmed);
    }

    renderRecentColors() {
        this.recentColorsContainer.innerHTML = '';
        const colors = this.getRecentColors();
        for (const hex of colors) {
            const swatch = document.createElement('button');
            swatch.className = 'color-swatch';
            swatch.dataset.code = hex;
            swatch.style.backgroundColor = hex;
            swatch.title = hex.toUpperCase();
            this.recentColorsContainer.appendChild(swatch);
        }
    }

    rgbToHex(rgb) {
        if (!rgb || !rgb.startsWith('rgb')) return rgb;
        const match = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
        if (!match) return rgb;
        const hex = (x) => ("0" + parseInt(x).toString(16)).slice(-2);
        return "#" + hex(match[1]) + hex(match[2]) + hex(match[3]);
    }

    parseRawToHtml(rawText) {
        let html = '';
        const CODE_REGEX = /(\^\d+|\\\\c(?:#[0-9a-fA-F]{6}|[RYBGPOW])|\\\\O\d+)/g;
        const parts = rawText.split(CODE_REGEX).filter(Boolean);

        for (let part of parts) {
            if (part.startsWith('^')) {
                const delayValue = part.substring(1);
                html += `<span class="marker marker-delay" data-code="${part}" data-ui-text="Delay ${delayValue}" contenteditable="false">&zwnj;</span>`;
            } else if (part.startsWith('\\\\O')) {
                const effectIndex = parseInt(part.slice(3), 10);
                html += `<span class="marker marker-effect" data-code="${part}" data-ui-text="Effect ${effectIndex}" contenteditable="false">&zwnj;</span>`;
            } else if (part.startsWith('\\\\c')) {
                const code = part.slice(3);
                if (code === 'W') {
                    html += `</span>`;
                } else {
                    const color = this.COLOR_MAP[code]?.hex || code;
                    html += `</span><span style="color: ${color};">`;
                }
            } else {
                html += part.replace(/</g, '&lt;').replace(/>/g, '&gt;');
            }
        }
        return `<span>${html}</span>`; // Wrap everything in a span to handle leading text
    }

    serializeHtmlToRaw() {
        let rawText = '';
        const defaultColor = this.rgbToHex(window.getComputedStyle(this.wysiwygEditor).color);
        let lastHexColor = defaultColor;

        function processNodes(nodes) {
            for (const node of nodes) {
                if (node.nodeType === Node.TEXT_NODE && node.textContent !== '\u200c') { // Ignore ZWNJ
                    const parentElement = node.parentElement;
                    const computedColor = this.rgbToHex(window.getComputedStyle(parentElement).color);

                    if (computedColor !== lastHexColor) {
                        if (computedColor === defaultColor || computedColor === this.COLOR_MAP['W'].hex) {
                            rawText += '\\\\cW';
                        } else {
                            const code = this.REVERSE_COLOR_MAP[computedColor];
                            rawText += code ? `\\\\c${code}` : `\\\\c${computedColor}`;
                        }
                        lastHexColor = computedColor;
                    }
                    rawText += node.textContent;
                } else if (node.nodeType === Node.ELEMENT_NODE) {
                    if (node.classList.contains('marker')) {
                        rawText += node.dataset.code;
                        continue;
                    }
                    if (node.hasChildNodes()) {
                        processNodes.call(this, node.childNodes);
                    }
                }
            }
        }

        processNodes.call(this, this.wysiwygEditor.childNodes);

        if (rawText.endsWith('\\\\cW')) {
            rawText = rawText.slice(0, -3);
        }

        return rawText;
    }

    insertHtmlAtCaret(html) {
        let sel = window.getSelection();
        if (sel.getRangeAt && sel.rangeCount) {
            let range = sel.getRangeAt(0);
            range.deleteContents();
            const el = document.createElement("div");
            el.innerHTML = html;
            let frag = document.createDocumentFragment(), node, lastNode;
            while ((node = el.firstChild)) {
                lastNode = frag.appendChild(node);
            }
            range.insertNode(frag);
            if (lastNode) {
                range = range.cloneRange();
                range.setStartAfter(lastNode);
                range.collapse(true);
                sel.removeAllRanges();
                sel.addRange(range);
            }
        }
    }
}