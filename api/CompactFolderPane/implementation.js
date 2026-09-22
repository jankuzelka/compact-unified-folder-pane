"use strict";

(function (exports) {
  // Prototype defaults. Kept together so they can later become options.
  const SETTINGS = Object.freeze({
    countsBreakpoint: 160,
    // Collapse the header controls early so they do not impose a minimum width,
    // but keep folder labels until the pane is much closer to the icon rail.
    toolbarBreakpoint: 100,
    iconBreakpoint: 120,
    railWidth: 60,
    iconSize: 24,
    rowMinHeight: 42,
    rowPaddingBlock: 7,
    toolbarHideDelay: 180,
    toolbarFadeDuration: 85,
  });

  const STYLE_ID = "compact-folder-pane-extension-style";
  const MODE_CLASS = "cfp-unified-only";
  const STATE_KEY = "__compactFolderPaneExtensionState";
  const patchedWindows = new Set();

  const STYLE_TEXT = `
body.cfp-unified-only #folderPane {
  container-type: inline-size !important;
  /* Thunderbird itself hard-codes 100px here to match the stock
     collapse-width. Keep the CSS minimum in sync with our patched splitter
     threshold, otherwise the pane can never physically reach icon mode. */
  min-inline-size: ${SETTINGS.railWidth}px !important;
}

@container (max-width: ${SETTINGS.countsBreakpoint}px) {
  body.cfp-unified-only #folderTree .folder-count-badge,
  body.cfp-unified-only #folderTree .folder-size,
  body.cfp-unified-only #folderTree .mode-name {
    display: none !important;
  }

  /* At the same point where secondary folder details disappear, reclaim the
     Compose label as well. Keep Thunderbird's native blue button and '+' glyph,
     but turn it into a centered square icon control. Once the header is
     portalled below toolbarBreakpoint this container rule no longer applies,
     so the expanded floating native toolbar retains its original label. */
  body.cfp-unified-only #folderPaneWriteMessage {
    inline-size: 32px !important;
    min-inline-size: 32px !important;
    max-inline-size: 32px !important;
    block-size: 32px !important;
    min-block-size: 32px !important;
    max-block-size: 32px !important;
    margin-block: auto !important;
    padding: 0 !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    font-size: 0 !important;
    /* Thunderbird positions the compose background icon for a text+icon
       button. Once the label is hidden, explicitly center that native icon
       inside our square control. */
    background-position: center center !important;
    background-repeat: no-repeat !important;
  }
}

@container (max-width: ${SETTINGS.iconBreakpoint}px) {
  body.cfp-unified-only #folderTree .name,
  body.cfp-unified-only #folderTree .twisty {
    display: none !important;
  }

  body.cfp-unified-only #folderTree .container {
    position: relative !important;
    min-height: ${SETTINGS.rowMinHeight}px !important;
    padding-inline: 0 !important;
    padding-block: ${SETTINGS.rowPaddingBlock}px !important;
    gap: 0 !important;
  }

  /* Pin the folder glyph to the geometric center of the rail. This avoids
     account indicators, sparkle markers and other optional row elements
     shifting the visible icon a few pixels left or right. */
  body.cfp-unified-only #folderTree .icon {
    position: absolute !important;
    inset-inline-start: 50% !important;
    transform: translateX(-50%) !important;
    width: ${SETTINGS.iconSize}px !important;
    height: ${SETTINGS.iconSize}px !important;
    min-width: ${SETTINGS.iconSize}px !important;
  }
}

/* In compact mode the *real* Thunderbird header is temporarily portalled to
   the document body. This gets it outside #folderPane's strict paint
   containment, allowing it to expand over the thread pane without resizing
   the layout. */
#folderPaneHeaderBar.cfp-floating-header {
  position: fixed !important;
  inset-inline-start: var(--cfp-header-inline-start) !important;
  inset-block-start: var(--cfp-header-block-start) !important;
  box-sizing: border-box !important;
  inline-size: var(--cfp-header-collapsed-width) !important;
  min-inline-size: var(--cfp-header-collapsed-width) !important;
  max-inline-size: var(--cfp-header-collapsed-width) !important;
  block-size: var(--cfp-header-height) !important;
  z-index: 1000 !important;
  justify-content: center !important;
  gap: 0 !important;
  padding-inline: 0 !important;
  overflow: hidden !important;
  background-color: var(--sidebar-background) !important;
  border-inline-end: 1px solid var(--sidebar-border) !important;
}

/* The synthetic trigger exists in the native header DOM so that cleanup and
   portalling stay simple, but it must never appear in the normal-width UI. */
#folderPaneHeaderBar > .cfp-action-trigger {
  display: none !important;
}

/* Compact state exposes one neutral trigger instead of pretending that one
   of Thunderbird's real actions represents the whole toolbar. Hover/focus on
   this trigger reveals the untouched native header actions. */
#folderPaneHeaderBar.cfp-floating-header:not(.cfp-header-expanded)
  > button:not(.cfp-action-trigger) {
  position: absolute !important;
  visibility: hidden !important;
  opacity: 0 !important;
  pointer-events: none !important;
}

#folderPaneHeaderBar.cfp-floating-header:not(.cfp-header-expanded)
  > .cfp-action-trigger {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  inline-size: 32px !important;
  min-inline-size: 32px !important;
  max-inline-size: 32px !important;
  block-size: 32px !important;
  margin: 0 !important;
  padding: 0 !important;
  color: inherit !important;
}

#folderPaneHeaderBar.cfp-floating-header:not(.cfp-header-expanded)
  > .cfp-action-trigger::before {
  content: "⋮" !important;
  display: block !important;
  font-size: 24px !important;
  line-height: 1 !important;
  letter-spacing: 0 !important;
  transform: translateY(-1px) !important;
}

/* Hover/focus reveals the original native toolbar as a floating overlay.
   It is the original DOM node, not a clone, so Thunderbird's existing click,
   context-menu, localization and visibility behaviour remain intact. */
#folderPaneHeaderBar.cfp-floating-header.cfp-header-expanded {
  inline-size: max-content !important;
  /* Never let the expanded hover hit-area become narrower than the compact
     rail. If Thunderbird hides one or more native actions, max-content can
     otherwise shrink below the rail width. A pointer in the now-uncovered
     strip would trigger mouseleave; collapsing restores that strip under the
     pointer, which triggers mouseenter again and creates an endless
     expand/close loop. */
  min-inline-size: var(--cfp-header-collapsed-width) !important;
  max-inline-size: none !important;
  /* Keep the hover hit-box vertically identical to the compact state.
     Changing this to auto makes the expanded toolbar shorter than the compact
     header on some themes/densities. A pointer in that lower strip then causes
     a self-sustaining enter -> expand -> leave -> collapse loop. */
  block-size: var(--cfp-header-height) !important;
  min-block-size: var(--cfp-header-height) !important;
  max-block-size: var(--cfp-header-height) !important;
  align-items: center !important;
  justify-content: flex-start !important;
  gap: 4px !important;
  padding-inline: 6px !important;
  overflow: visible !important;
  border: 1px solid var(--sidebar-border) !important;
  border-inline-start: 0 !important;
  border-radius: 0 5px 5px 0 !important;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.22) !important;
}

/* Expansion is intentionally two-phase. The expanded geometry is committed
   first with the native actions at opacity 0. JS then adds
   .cfp-header-visible on the next animation frame. This guarantees a real
   rendered start state for the opacity transition instead of asking Gecko to
   resolve geometry, visibility and opacity in a single style change. */
#folderPaneHeaderBar.cfp-floating-header.cfp-header-expanded
  > button:not(.cfp-action-trigger) {
  position: static !important;
  visibility: visible !important;
  opacity: 0 !important;
  pointer-events: none !important;
  transition: opacity ${SETTINGS.toolbarFadeDuration}ms ease-out !important;
}

#folderPaneHeaderBar.cfp-floating-header.cfp-header-expanded.cfp-header-visible
  > button:not(.cfp-action-trigger) {
  opacity: 1 !important;
  pointer-events: auto !important;
}

/* While closing, keep the expanded geometry fixed and only remove the visible
   phase. transitionend then returns the header to the compact rail. */
#folderPaneHeaderBar.cfp-floating-header.cfp-header-expanded.cfp-header-closing
  > button:not(.cfp-action-trigger) {
  opacity: 0 !important;
  pointer-events: none !important;
}

/* The compact trigger only represents the toolbar. Once expanded, show the
   native Thunderbird controls and get the trigger out of the way. */
#folderPaneHeaderBar.cfp-floating-header.cfp-header-expanded
  > .cfp-action-trigger {
  display: none !important;
}

/* Never defeat Thunderbird's own [hidden] state when it has been configured
   to omit a header action. */
#folderPaneHeaderBar.cfp-floating-header.cfp-header-expanded > button[hidden] {
  display: none !important;
}

/* Placeholder keeps the folder tree at exactly the same vertical position
   while the real header is portalled out of #folderPane. */
.cfp-header-placeholder {
  flex: 0 0 var(--cfp-placeholder-height) !important;
  block-size: var(--cfp-placeholder-height) !important;
  min-block-size: var(--cfp-placeholder-height) !important;
  pointer-events: none !important;
}
`;

  function isAbout3PaneWindow(window) {
    try {
      return Boolean(window) && !window.closed && window.location.href === "about:3pane";
    } catch (error) {
      return false;
    }
  }

  function isElementActuallyVisible(element) {
    return Boolean(
      element &&
        !element.hidden &&
        element.isConnected &&
        element.getClientRects().length
    );
  }

  function cancelFadeTimer(state) {
    // Kept only as a safety fallback in case Gecko suppresses transitionend
    // (for example during teardown). Normal animation completion is driven by
    // the actual opacity transition event, not by a guessed timer.
    if (state.fadeTimer !== null) {
      state.window.clearTimeout(state.fadeTimer);
      state.fadeTimer = null;
    }
  }

  function cancelOpenFrame(state) {
    if (state.openFrame !== null) {
      state.window.cancelAnimationFrame(state.openFrame);
      state.openFrame = null;
    }
  }

  function finishHeaderCollapse(state) {
    cancelFadeTimer(state);
    cancelOpenFrame(state);
    state.headerExpanded = false;
    state.headerBar?.classList.remove(
      "cfp-header-expanded",
      "cfp-header-visible",
      "cfp-header-closing"
    );
  }

  function startHeaderFadeIn(state) {
    cancelOpenFrame(state);

    // #folderPaneHeaderBar has just changed from compact geometry to expanded
    // geometry. Force that opacity:0 start state to be computed, then wait for
    // the next frame before requesting opacity:1. This prevents Gecko from
    // coalescing both states into one paint (the source of the previous
    // fade-then-pop flicker).
    void state.headerBar.getBoundingClientRect();
    state.openFrame = state.window.requestAnimationFrame(() => {
      state.openFrame = null;
      if (
        state.portalActive &&
        state.headerBar.classList.contains("cfp-header-expanded") &&
        !state.headerBar.classList.contains("cfp-header-closing")
      ) {
        state.headerBar.classList.add("cfp-header-visible");
      }
    });
  }

  function setHeaderExpanded(state, expanded, { force = false, immediate = false } = {}) {
    if (!state.portalActive || !state.headerBar) {
      return;
    }

    if (
      !force &&
      !expanded &&
      (state.headerHovered || state.headerFocused || state.popupOpen)
    ) {
      return;
    }

    cancelFadeTimer(state);

    if (expanded) {
      state.headerExpanded = true;

      // If a fade-out is already in progress, simply reverse the same opacity
      // transition from its current value. Geometry is already expanded.
      if (state.headerBar.classList.contains("cfp-header-closing")) {
        cancelOpenFrame(state);
        state.headerBar.classList.remove("cfp-header-closing");
        state.headerBar.classList.add("cfp-header-visible");
        return;
      }

      if (!state.headerBar.classList.contains("cfp-header-expanded")) {
        state.headerBar.classList.add("cfp-header-expanded");
        startHeaderFadeIn(state);
      } else if (!state.headerBar.classList.contains("cfp-header-visible")) {
        startHeaderFadeIn(state);
      }
      return;
    }

    if (immediate || !state.headerBar.classList.contains("cfp-header-expanded")) {
      finishHeaderCollapse(state);
      return;
    }

    cancelOpenFrame(state);

    // If the opening phase has not reached opacity:1 yet, there is nothing to
    // animate out. Collapse immediately instead of waiting for a transition
    // that cannot fire.
    if (!state.headerBar.classList.contains("cfp-header-visible")) {
      finishHeaderCollapse(state);
      return;
    }

    state.headerBar.classList.add("cfp-header-closing");
    state.headerBar.classList.remove("cfp-header-visible");

    // transitionend is authoritative. This longer timeout is only a teardown /
    // no-transition fallback and should not determine normal visual timing.
    state.fadeTimer = state.window.setTimeout(() => {
      state.fadeTimer = null;
      if (state.headerBar.classList.contains("cfp-header-closing")) {
        finishHeaderCollapse(state);
      }
    }, SETTINGS.toolbarFadeDuration * 4);
  }

  function forceHeaderCollapse(state) {
    if (!state.portalActive) {
      return;
    }

    cancelHideTimer(state);
    state.suppressHoverExpansion = state.headerHovered;
    state.suppressFocusExpansion = state.headerFocused;
    setHeaderExpanded(state, false, { force: true });
  }

  function cancelHideTimer(state) {
    if (state.hideTimer !== null) {
      state.window.clearTimeout(state.hideTimer);
      state.hideTimer = null;
    }
  }

  function scheduleHeaderCollapse(state) {
    cancelHideTimer(state);
    state.hideTimer = state.window.setTimeout(() => {
      state.hideTimer = null;
      setHeaderExpanded(state, false);
    }, SETTINGS.toolbarHideDelay);
  }

  function syncFloatingHeaderGeometry(state) {
    if (!state.portalActive) {
      return;
    }

    const paneRect = state.folderPane.getBoundingClientRect();
    const width = Math.max(paneRect.width, SETTINGS.railWidth);

    state.headerBar.style.setProperty("--cfp-header-inline-start", `${paneRect.left}px`);
    state.headerBar.style.setProperty("--cfp-header-block-start", `${paneRect.top}px`);
    state.headerBar.style.setProperty("--cfp-header-collapsed-width", `${width}px`);
    state.headerBar.style.setProperty("--cfp-header-height", `${state.headerHeight}px`);
  }

  function enterHeaderPortal(state) {
    if (state.portalActive || !isElementActuallyVisible(state.headerBar)) {
      return;
    }

    const headerRect = state.headerBar.getBoundingClientRect();
    state.headerHeight = Math.max(1, headerRect.height);

    const placeholder = state.document.createElement("div");
    placeholder.className = "cfp-header-placeholder";
    placeholder.setAttribute("aria-hidden", "true");
    placeholder.style.setProperty("--cfp-placeholder-height", `${state.headerHeight}px`);

    state.headerParent.insertBefore(placeholder, state.headerBar);
    state.placeholder = placeholder;

    // Move the real native toolbar outside #folderPane, whose `contain: strict`
    // and `overflow: hidden` would otherwise clip any hover expansion.
    state.document.body.appendChild(state.headerBar);
    state.headerBar.classList.add("cfp-floating-header");
    state.portalActive = true;

    syncFloatingHeaderGeometry(state);
  }

  function exitHeaderPortal(state) {
    if (!state.portalActive) {
      return;
    }

    cancelHideTimer(state);
    cancelFadeTimer(state);
    cancelOpenFrame(state);
    state.headerHovered = false;
    state.headerFocused = false;
    state.popupOpen = false;
    state.headerExpanded = false;

    state.headerBar.classList.remove(
      "cfp-floating-header",
      "cfp-header-expanded",
      "cfp-header-visible",
      "cfp-header-closing"
    );
    state.headerBar.style.removeProperty("--cfp-header-inline-start");
    state.headerBar.style.removeProperty("--cfp-header-block-start");
    state.headerBar.style.removeProperty("--cfp-header-collapsed-width");
    state.headerBar.style.removeProperty("--cfp-header-height");
    state.suppressHoverExpansion = false;
    state.suppressFocusExpansion = false;

    if (state.headerParent?.isConnected) {
      if (state.headerNextSibling?.parentNode === state.headerParent) {
        state.headerParent.insertBefore(state.headerBar, state.headerNextSibling);
      } else {
        state.headerParent.appendChild(state.headerBar);
      }
    }

    state.placeholder?.remove();
    state.placeholder = null;
    state.portalActive = false;
  }

  function isUnifiedOnlyMode(state) {
    const modes = Array.from(
      state.folderTree?.children ?? [],
      element => element.dataset.mode
    ).filter(Boolean);
    return modes.length === 1 && modes[0] === "smart";
  }

  function restoreSplitterCollapseWidth(state) {
    if (!state.splitter?.isConnected) {
      return;
    }
    if (state.originalCollapseWidth === null) {
      state.splitter.removeAttribute("collapse-width");
    } else {
      state.splitter.setAttribute("collapse-width", state.originalCollapseWidth);
    }
  }

  function syncFolderModeState(state) {
    const enabled = isUnifiedOnlyMode(state);

    if (enabled === state.unifiedOnlyEnabled) {
      if (enabled) {
        updateCompactState(state);
      }
      return;
    }

    state.unifiedOnlyEnabled = enabled;

    if (!enabled) {
      exitHeaderPortal(state);
      state.document.body.classList.remove(MODE_CLASS);
      restoreSplitterCollapseWidth(state);
      return;
    }

    state.document.body.classList.add(MODE_CLASS);
    state.splitter.setAttribute("collapse-width", String(SETTINGS.railWidth));
    updateCompactState(state);
  }

  function updateCompactState(state) {
    if (!state.unifiedOnlyEnabled) {
      return;
    }

    const paneCollapsed =
      state.folderPane.classList.contains("collapsed-by-splitter") ||
      state.folderPane.getClientRects().length === 0;

    if (paneCollapsed) {
      exitHeaderPortal(state);
      return;
    }

    const width = state.folderPane.getBoundingClientRect().width;
    const compact = width <= SETTINGS.toolbarBreakpoint;

    if (compact) {
      enterHeaderPortal(state);
      if (state.portalActive) {
        syncFloatingHeaderGeometry(state);
      }
    } else {
      exitHeaderPortal(state);
    }
  }

  function onHeaderMouseEnter(state) {
    state.headerHovered = true;
    cancelHideTimer(state);
    if (!state.suppressHoverExpansion) {
      setHeaderExpanded(state, true);
    }
  }

  function onHeaderMouseLeave(state) {
    state.headerHovered = false;
    state.suppressHoverExpansion = false;
    scheduleHeaderCollapse(state);
  }

  function onHeaderFocusIn(state) {
    state.headerFocused = true;
    cancelHideTimer(state);
    if (!state.suppressFocusExpansion) {
      setHeaderExpanded(state, true);
    }
  }

  function onHeaderFocusOut(state) {
    // focusout fires before focus has settled. Check it on the next turn.
    state.window.setTimeout(() => {
      state.headerFocused = state.headerBar.contains(state.document.activeElement);
      if (!state.headerFocused) {
        state.suppressFocusExpansion = false;
        scheduleHeaderCollapse(state);
      }
    }, 0);
  }

  function isAnyHeaderPopupOpen(state) {
    for (const id of ["folderPaneMoreContext", "folderPaneGetMessagesContext"]) {
      const popup = state.document.getElementById(id);
      if (popup && popup.state && popup.state !== "closed") {
        return true;
      }
    }
    return false;
  }

  function onHeaderClick(state, event) {
    const button = event.target?.closest?.("button");
    if (
      !button ||
      button === state.triggerButton ||
      button.parentNode !== state.headerBar
    ) {
      return;
    }

    // Direct actions (Compose, a simple Get Messages action, etc.) should fold
    // the overlay away immediately after activation. If Thunderbird opened one
    // of its native popups, keep the toolbar visible until that popup closes.
    // A short delay lets popupshown / XUL popup state settle first.
    state.window.setTimeout(() => {
      if (!state.popupOpen && !isAnyHeaderPopupOpen(state)) {
        forceHeaderCollapse(state);
      }
    }, 50);
  }

  function onTriggerClick(state) {
    state.suppressHoverExpansion = false;
    state.suppressFocusExpansion = false;
    cancelHideTimer(state);
    setHeaderExpanded(state, true);
  }

  function onHeaderTransitionEnd(state, event) {
    if (
      event.propertyName !== "opacity" ||
      !state.headerBar.classList.contains("cfp-header-closing") ||
      event.target === state.triggerButton ||
      event.target.parentNode !== state.headerBar
    ) {
      return;
    }

    // All native action buttons use the same opacity transition. The first
    // completed action therefore marks the end of the group fade-out.
    finishHeaderCollapse(state);
  }

  function isHeaderPopup(target) {
    return target?.id === "folderPaneMoreContext" ||
      target?.id === "folderPaneGetMessagesContext";
  }

  function onPopupShown(state, event) {
    if (!isHeaderPopup(event.target)) {
      return;
    }
    state.popupOpen = true;
    cancelHideTimer(state);
    setHeaderExpanded(state, true);
  }

  function onPopupHidden(state, event) {
    if (!isHeaderPopup(event.target)) {
      return;
    }
    state.popupOpen = false;
    forceHeaderCollapse(state);
  }

  function restoreWindow(window) {
    const state = window?.[STATE_KEY];
    if (!state) {
      patchedWindows.delete(window);
      return;
    }

    try {
      state.resizeObserver?.disconnect();
      state.folderPaneMutationObserver?.disconnect();
      state.folderTreeMutationObserver?.disconnect();
      state.headerMutationObserver?.disconnect();
      cancelHideTimer(state);
      cancelFadeTimer(state);
      cancelOpenFrame(state);

      state.window.removeEventListener("resize", state.onWindowResize);
      state.headerBar?.removeEventListener("mouseenter", state.onMouseEnter);
      state.headerBar?.removeEventListener("mouseleave", state.onMouseLeave);
      state.headerBar?.removeEventListener("focusin", state.onFocusIn);
      state.headerBar?.removeEventListener("focusout", state.onFocusOut);
      state.headerBar?.removeEventListener("click", state.onHeaderClick);
      state.headerBar?.removeEventListener("transitionend", state.onTransitionEnd);
      state.triggerButton?.removeEventListener("click", state.onTriggerClick);
      state.document.removeEventListener("popupshown", state.onPopupShown, true);
      state.document.removeEventListener("popuphidden", state.onPopupHidden, true);

      exitHeaderPortal(state);
      state.triggerButton?.remove();

      restoreSplitterCollapseWidth(state);
      state.document?.body?.classList.remove(MODE_CLASS);

      state.styleElement?.remove();
    } catch (error) {
      console.error("Compact Folder Pane: cleanup failed", error);
    }

    try {
      delete window[STATE_KEY];
    } catch (error) {
      // A closing chrome window may already be partially torn down.
    }
    patchedWindows.delete(window);
  }

  function patchWindow(window) {
    if (!isAbout3PaneWindow(window) || window[STATE_KEY]) {
      return false;
    }

    const document = window.document;
    const folderPane = document.getElementById("folderPane");
    const splitter = document.getElementById("folderPaneSplitter");
    const headerBar = document.getElementById("folderPaneHeaderBar");
    const folderTree = document.getElementById("folderTree");

    // Feature detection: leave the UI untouched if internals differ.
    if (
      !document.head ||
      !document.body ||
      !folderPane ||
      !splitter ||
      !headerBar ||
      !folderTree
    ) {
      return false;
    }

    const styleElement = document.createElement("style");
    styleElement.id = STYLE_ID;
    styleElement.textContent = STYLE_TEXT;
    document.head.appendChild(styleElement);

    const triggerButton = document.createElement("button");
    triggerButton.type = "button";
    triggerButton.className =
      "button button-flat icon-button icon-only cfp-action-trigger";
    triggerButton.setAttribute("aria-label", "Folder pane actions");
    triggerButton.setAttribute("title", "Folder pane actions");
    triggerButton.setAttribute("tabindex", "0");
    headerBar.appendChild(triggerButton);

    const state = {
      window,
      document,
      folderPane,
      splitter,
      headerBar,
      folderTree,
      headerParent: headerBar.parentNode,
      headerNextSibling: headerBar.nextSibling,
      composeButton: document.getElementById("folderPaneWriteMessage"),
      getMessagesButton: document.getElementById("folderPaneGetMessages"),
      moreButton: document.getElementById("folderPaneMoreButton"),
      triggerButton,
      styleElement,
      originalCollapseWidth: splitter.getAttribute("collapse-width"),
      resizeObserver: null,
      folderPaneMutationObserver: null,
      folderTreeMutationObserver: null,
      headerMutationObserver: null,
      placeholder: null,
      portalActive: false,
      unifiedOnlyEnabled: false,
      headerHeight: 0,
      headerHovered: false,
      headerFocused: false,
      popupOpen: false,
      headerExpanded: false,
      suppressHoverExpansion: false,
      suppressFocusExpansion: false,
      hideTimer: null,
      fadeTimer: null,
      openFrame: null,
      onWindowResize: null,
      onMouseEnter: null,
      onMouseLeave: null,
      onFocusIn: null,
      onFocusOut: null,
      onHeaderClick: null,
      onTransitionEnd: null,
      onTriggerClick: null,
      onPopupShown: null,
      onPopupHidden: null,
    };

    // The narrower splitter threshold is enabled only while Unified Folders is
    // the sole active folder mode. Other folder modes keep Thunderbird's stock
    // geometry and collapse behaviour.

    state.onWindowResize = () => {
      if (state.portalActive) {
        syncFloatingHeaderGeometry(state);
      }
    };
    state.onMouseEnter = () => onHeaderMouseEnter(state);
    state.onMouseLeave = () => onHeaderMouseLeave(state);
    state.onFocusIn = () => onHeaderFocusIn(state);
    state.onFocusOut = () => onHeaderFocusOut(state);
    state.onHeaderClick = event => onHeaderClick(state, event);
    state.onTransitionEnd = event => onHeaderTransitionEnd(state, event);
    state.onTriggerClick = () => onTriggerClick(state);
    state.onPopupShown = event => onPopupShown(state, event);
    state.onPopupHidden = event => onPopupHidden(state, event);

    headerBar.addEventListener("mouseenter", state.onMouseEnter);
    headerBar.addEventListener("mouseleave", state.onMouseLeave);
    headerBar.addEventListener("focusin", state.onFocusIn);
    headerBar.addEventListener("focusout", state.onFocusOut);
    headerBar.addEventListener("click", state.onHeaderClick);
    headerBar.addEventListener("transitionend", state.onTransitionEnd);
    triggerButton.addEventListener("click", state.onTriggerClick);
    document.addEventListener("popupshown", state.onPopupShown, true);
    document.addEventListener("popuphidden", state.onPopupHidden, true);
    window.addEventListener("resize", state.onWindowResize);

    if (typeof window.ResizeObserver === "function") {
      state.resizeObserver = new window.ResizeObserver(() => updateCompactState(state));
      state.resizeObserver.observe(folderPane);
    }

    if (typeof window.MutationObserver === "function") {
      // Splitter collapse/expand changes the class on #folderPane.
      state.folderPaneMutationObserver = new window.MutationObserver(() => {
        updateCompactState(state);
      });
      state.folderPaneMutationObserver.observe(folderPane, {
        attributes: true,
        attributeFilter: ["class"],
      });

      // Thunderbird's own activeModes getter is derived from the direct
      // children of #folderTree and their data-mode values. Observe exactly
      // that structure so the rail is active only for Unified Folders alone.
      state.folderTreeMutationObserver = new window.MutationObserver(() => {
        syncFolderModeState(state);
      });
      state.folderTreeMutationObserver.observe(folderTree, {
        childList: true,
      });

      // Thunderbird can show/hide/reconfigure header actions from its own menu.
      state.headerMutationObserver = new window.MutationObserver(() => {
        // The header itself can be hidden from Thunderbird's own options. In
        // that case remove the portal and its placeholder completely. Native
        // button visibility changes are otherwise inherited automatically.
        if (state.headerBar.hidden) {
          exitHeaderPortal(state);
          return;
        }

        updateCompactState(state);
        if (state.portalActive) {
          syncFloatingHeaderGeometry(state);
        }
      });
      state.headerMutationObserver.observe(headerBar, {
        attributes: true,
        subtree: true,
        attributeFilter: ["hidden"],
      });
    }

    window[STATE_KEY] = state;
    patchedWindows.add(window);
    syncFolderModeState(state);

    window.addEventListener(
      "unload",
      () => {
        try {
          state.resizeObserver?.disconnect();
          state.folderPaneMutationObserver?.disconnect();
          state.folderTreeMutationObserver?.disconnect();
          state.headerMutationObserver?.disconnect();
          cancelHideTimer(state);
          cancelFadeTimer(state);
          cancelOpenFrame(state);
        } catch (error) {
          // Ignore teardown races.
        }
        patchedWindows.delete(window);
      },
      { once: true }
    );

    return true;
  }

  function patchExistingMailTabs() {
    const windows = Services.wm.getEnumerator("mail:3pane");
    while (windows.hasMoreElements()) {
      const outerWindow = windows.getNext();
      const tabmail = outerWindow.document.getElementById("tabmail");
      if (!tabmail) {
        continue;
      }

      for (const tab of tabmail.tabInfo ?? []) {
        if (tab?.mode?.name !== "mail3PaneTab") {
          continue;
        }
        patchWindow(tab.chromeBrowser?.contentWindow);
      }
    }
  }

  function onChromeDocumentCreated(subject, topic) {
    if (topic !== "chrome-document-global-created") {
      return;
    }

    const window = subject;
    window.addEventListener(
      "DOMContentLoaded",
      () => {
        patchWindow(window);
      },
      { once: true }
    );
  }

  class CompactFolderPane extends ExtensionCommon.ExtensionAPI {
    onStartup() {
      Services.obs.addObserver(onChromeDocumentCreated, "chrome-document-global-created");
      patchExistingMailTabs();
    }

    getAPI(context) {
      return {
        CompactFolderPane: {
          async reapply() {
            patchExistingMailTabs();
          },
        },
      };
    }

    onShutdown(isAppShutdown) {
      try {
        Services.obs.removeObserver(onChromeDocumentCreated, "chrome-document-global-created");
      } catch (error) {
        // The observer may already have been removed during shutdown.
      }

      if (!isAppShutdown) {
        for (const window of [...patchedWindows]) {
          restoreWindow(window);
        }
        Services.obs.notifyObservers(null, "startupcache-invalidate", null);
      }
    }
  }

  exports.CompactFolderPane = CompactFolderPane;
})(this);
