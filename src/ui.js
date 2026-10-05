(function initializeUIManager(/** @type {any} */ globalScope) {
  "use strict";

  const Constants = globalScope.FBISConstants ||
    (typeof require === "function" ? require("./constants.js") : null);
  const I18n = globalScope.FBISI18n ||
    (typeof require === "function" ? require("./i18n.js") : null);
  const { SELECTORS, TIMINGS } = Constants;

  const PILL_STYLES = `
    :host{all:initial}.wrap{position:relative;display:inline-flex;align-items:stretch;filter:drop-shadow(0 4px 16px rgba(0,0,0,.28))}.q,.more{border:1px solid rgba(255,255,255,.18);background:rgba(0,0,0,.72);color:#fff;font:700 12px/1 system-ui,-apple-system,"Segoe UI",sans-serif;opacity:.64;cursor:pointer;transition:opacity .15s ease,transform .15s ease,background .15s ease}.q{display:inline-flex;align-items:center;gap:7px;border-radius:20px 0 0 20px;padding:7px 10px 7px 11px;border-right:0}.more{width:30px;border-radius:0 20px 20px 0;padding:0}.q:hover,.q:focus-visible,.more:hover,.more:focus-visible{opacity:1;background:rgba(0,0,0,.86)}.q:active,.more:active{transform:translateY(1px)}.q:disabled,.more:disabled,.menu button:disabled{cursor:progress;opacity:.72}.i{width:15px;height:15px;display:grid;place-items:center}.spin{animation:s .8s linear infinite}@keyframes s{to{transform:rotate(360deg)}}.done{color:#62d58b}.error{color:#ff8a8a}.menu{position:absolute;top:calc(100% + 6px);right:0;min-width:190px;padding:5px;border:1px solid rgba(255,255,255,.16);border-radius:11px;background:rgba(20,20,22,.97);box-shadow:0 10px 28px rgba(0,0,0,.42);z-index:3}.menu[hidden]{display:none}.menu button{display:block;width:100%;border:0;border-radius:8px;padding:9px 10px;background:transparent;color:#fff;text-align:left;font:600 12px/1.2 system-ui,-apple-system,"Segoe UI",sans-serif;cursor:pointer}.menu button:hover,.menu button:focus-visible{background:rgba(255,255,255,.1)}.toast{position:absolute;right:0;top:calc(100% + 8px);max-width:240px;padding:7px 10px;border-radius:9px;background:rgba(18,18,20,.96);color:#fff;font:600 11px/1.3 system-ui,-apple-system,"Segoe UI",sans-serif;opacity:0;transform:translateY(-3px);pointer-events:none;transition:opacity .15s ease,transform .15s ease;z-index:4}.toast.success{box-shadow:inset 3px 0 #62d58b}.toast.error{box-shadow:inset 3px 0 #ff8a8a}.toast.show{opacity:1;transform:translateY(0)}`;

  class UIManager {
    constructor() {
      this.views = new WeakMap();
      this.activePill = null;
      this.toastTimer = 0;
    }

    /**
     * @param {Element} postContainer
     * @param {number} mediaCount
     * @param {(action: string, pillElement: Element) => void|Promise<void>} onActionClick
     * @returns {Element|null}
     */
    renderFloatingPill(postContainer, mediaCount, onActionClick) {
      if (!postContainer?.isConnected || postContainer.querySelector?.(SELECTORS.POST.QUICK_ACTION)) {
        return null;
      }

      const mediaContainer = /** @type {HTMLElement} */ (
        postContainer.querySelector?.(`${SELECTORS.POST.PHOTO_LINKS}, ${SELECTORS.MEDIA.VIDEO}`)?.parentElement ||
        postContainer
      );
      const host = document.createElement("span");
      host.dataset.fbisQuickAction = "1";
      host.style.cssText = "position:absolute;top:8px;right:8px;z-index:20;display:block;";
      if (globalScope.getComputedStyle?.(mediaContainer)?.position === "static") {
        mediaContainer.style.position = "relative";
      }

      const root = host.attachShadow({ mode: "closed" });
      const style = document.createElement("style");
      style.textContent = PILL_STYLES;
      const wrap = document.createElement("span");
      wrap.className = "wrap";
      const button = document.createElement("button");
      button.className = "q";
      button.type = "button";
      const icon = document.createElement("span");
      icon.className = "i";
      icon.textContent = "⇩";
      const label = document.createElement("span");
      label.textContent = String(Number(mediaCount) || "");
      button.append(icon, label);

      const moreButton = document.createElement("button");
      moreButton.className = "more";
      moreButton.type = "button";
      moreButton.setAttribute("aria-label", I18n?.t?.("download_mode") || "Download mode");
      moreButton.textContent = "▾";

      const menu = document.createElement("div");
      menu.className = "menu";
      menu.hidden = true;
      const optionButtons = [];
      const menuOptions = [
        ["zip", I18n?.t?.("download_zip") || "ZIP"],
        ["manager", I18n?.t?.("direct_idm_fdm") || "IDM/FDM"],
        ["copy", I18n?.t?.("copy_hd_links") || "Copy HD links"],
        ["comments", I18n?.t?.("harvest_comments") || "Comment media"]
      ];
      for (const [mode, text] of menuOptions) {
        const option = document.createElement("button");
        option.type = "button";
        option.dataset.mode = mode;
        option.textContent = text;
        menu.appendChild(option);
        optionButtons.push(option);
      }

      const toast = document.createElement("span");
      toast.className = "toast";
      wrap.append(button, moreButton, menu, toast);
      root.append(style, wrap);
      mediaContainer.appendChild(host);

      const controller = new AbortController();
      const listenerOptions = { signal: controller.signal };
      moreButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!button.disabled) menu.hidden = !menu.hidden;
      }, listenerOptions);
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.activePill = host;
        const view = this.views.get(host);
        void onActionClick(view?.defaultAction || "zip", host);
      }, listenerOptions);
      for (const option of optionButtons) {
        option.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          this.activePill = host;
          menu.hidden = true;
          void onActionClick(option.dataset.mode || "zip", host);
        }, listenerOptions);
      }

      this.views.set(host, {
        button,
        controller,
        defaultAction: "zip",
        icon,
        label,
        menu,
        moreButton,
        optionButtons,
        toast
      });
      return host;
    }

    /**
     * @param {Element} pillElement
     * @param {string} stateText
     * @param {'idle'|'loading'|'done'|'error'|'video'|'download'} [iconType='idle']
     * @returns {void}
     */
    updatePillState(pillElement, stateText, iconType = "idle") {
      const view = this.views.get(pillElement);
      if (!view) return;
      const busy = iconType === "loading";
      view.menu.hidden = true;
      view.button.disabled = busy;
      view.moreButton.disabled = busy;
      for (const option of view.optionButtons) option.disabled = busy;
      view.icon.classList.toggle("spin", busy);
      view.icon.classList.toggle("done", iconType === "done");
      view.icon.classList.toggle("error", iconType === "error");
      view.icon.textContent = iconType === "loading"
        ? "↻"
        : iconType === "done"
          ? "✓"
          : iconType === "error"
            ? "!"
            : iconType === "video"
              ? "▶"
              : "⇩";
      view.label.textContent = stateText;
    }

    /**
     * @param {string} message
     * @param {'info'|'success'|'error'} [type='info']
     * @returns {void}
     */
    showToast(message, type = "info") {
      const view = this.activePill ? this.views.get(this.activePill) : null;
      if (!view) return;
      globalScope.clearTimeout(this.toastTimer);
      view.toast.textContent = message;
      view.toast.classList.remove("success", "error");
      if (type === "success" || type === "error") view.toast.classList.add(type);
      view.toast.classList.add("show");
      this.toastTimer = globalScope.setTimeout(
        () => view.toast.classList.remove("show"),
        TIMINGS.UI_FEEDBACK_MS
      );
    }

    /**
     * @param {Element} pillElement
     * @param {{label?: string, moreAria?: string, menuOptions?: Array<[string,string]>, defaultAction?: string, iconType?: 'video'|'download'}} labels
     * @returns {void}
     */
    updatePillLabels(pillElement, labels = {}) {
      const view = this.views.get(pillElement);
      if (!view) return;
      if (labels.label) view.label.textContent = labels.label;
      if (labels.moreAria) view.moreButton.setAttribute("aria-label", labels.moreAria);
      if (labels.defaultAction) view.defaultAction = labels.defaultAction;
      if (labels.iconType === "video" || labels.iconType === "download") {
        view.icon.textContent = labels.iconType === "video" ? "▶" : "⇩";
      }
      if (Array.isArray(labels.menuOptions)) {
        for (let index = 0; index < view.optionButtons.length; index += 1) {
          const [, text] = labels.menuOptions[index] || [];
          if (text) view.optionButtons[index].textContent = text;
        }
      }
    }

    /**
     * @param {Element|null|undefined} element
     * @returns {void}
     */
    cleanupElement(element) {
      if (!element) return;
      const view = this.views.get(element);
      view?.controller.abort();
      if (this.activePill === element) this.activePill = null;
      this.views.delete(element);
      element.remove?.();
    }
  }

  const api = Object.freeze({ UIManager });
  globalScope.FBISUI = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
