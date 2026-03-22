// ─────────────────────────────────────────────────────────
//  CRITIQUE — code.js
//  Runs INSIDE Figma. No internet. No API key needed.
//  Reads your layer data directly and runs UX rules on it.
// ─────────────────────────────────────────────────────────

figma.showUI(__html__, { width: 360, height: 560 });

// ── Listen for messages from ui.html ──
figma.ui.onmessage = (msg) => {

  // ── Message 1: User clicked the drop zone ──
  // ui.html is asking "what frame does the user have selected right now?"
  if (msg.type === "get-selection") {
    const selection = figma.currentPage.selection;

    if (selection.length === 0) {
      figma.ui.postMessage({
        type: "error",
        message: "Nothing selected. Click a Frame in Figma first, then try again."
      });
      return;
    }

    const node = selection[0];

    if (node.type !== "FRAME" && node.type !== "COMPONENT" && node.type !== "GROUP") {
      figma.ui.postMessage({
        type: "error",
        message: "Please select a Frame or Component, not an individual layer."
      });
      return;
    }

    // Send back the frame name and size so ui.html can show it in the drop zone
    figma.ui.postMessage({
      type: "selection-info",
      name: node.name,
      w: Math.round(node.width),
      h: Math.round(node.height)
    });
    return;
  }

  // ── Message 2: User clicked "Run Critique" ──
  if (msg.type === "run-critique") {
    const selection = figma.currentPage.selection;

    if (selection.length === 0) {
      figma.ui.postMessage({
        type: "error",
        message: "No frame selected. Please select a Frame and try again."
      });
      return;
    }

    const node = selection[0];

    if (node.type !== "FRAME" && node.type !== "COMPONENT" && node.type !== "GROUP") {
      figma.ui.postMessage({
        type: "error",
        message: "Please select a Frame or Component."
      });
      return;
    }

    // Tell ui.html to show the loading spinner
    figma.ui.postMessage({ type: "loading" });

    // ── Run the rules the user selected ──
    const focusAreas = msg.focusAreas || ["hierarchy", "spacing", "accessibility"];
    const issues = [];

    if (focusAreas.includes("spacing"))       issues.push(...checkSpacing(node));
    if (focusAreas.includes("accessibility")) issues.push(...checkAccessibility(node));
    if (focusAreas.includes("hierarchy"))     issues.push(...checkHierarchy(node));
    if (focusAreas.includes("contrast"))      issues.push(...checkContrast(node));
    if (focusAreas.includes("typography"))    issues.push(...checkTypography(node));
    if (focusAreas.includes("touchTargets"))  issues.push(...checkTouchTargets(node));

    // Calculate the score and send everything back to ui.html
    const score = calcScore(issues);

    figma.ui.postMessage({
      type: "results",
      frameName: node.name,
      frameSize: { w: Math.round(node.width), h: Math.round(node.height) },
      issues: issues,
      score: score
    });
  }
};


// ═══════════════════════════════════════════════════════════
//  RULE 1 — SPACING
//  Reads the Y position and height of every layer.
//  Calculates gaps between them. Flags off-grid values.
// ═══════════════════════════════════════════════════════════
function checkSpacing(node) {
  const issues = [];
  const children = node.children;
  if (!children || children.length < 2) return issues;

  // Sort layers top to bottom by their Y position
  const sorted = [...children].sort((a, b) => a.y - b.y);

  // Calculate the gap between each pair of adjacent layers
  const gaps = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const gap = sorted[i + 1].y - (sorted[i].y + sorted[i].height);
    if (gap > 0) gaps.push(Math.round(gap));
  }

  if (gaps.length === 0) return issues;

  // Check 1: Are any gaps NOT a multiple of 4?
  // The 4pt grid is a fundamental layout principle — all spacing should snap to it.
  const offGrid = gaps.filter(g => g % 4 !== 0);
  if (offGrid.length > 0) {
    issues.push({
      title: "Spacing values are off the 4pt grid",
      category: "spacing",
      severity: "medium",
      // severity = medium because: user can still use the screen, but
      // off-grid spacing creates subtle visual inconsistency that feels "wrong"
      whatsWrong: `Found gap values of ${[...new Set(offGrid)].join("px, ")}px — these are not multiples of 4.`,
      whyItMatters: "Off-grid spacing creates visual inconsistency that's hard to pinpoint but easy to feel. Layouts look slightly 'off' even when nothing is obviously broken.",
      fixSuggestion: "Snap all gaps to the nearest 4pt value. Define a spacing scale — 4, 8, 12, 16, 24, 32 — and only use values from that scale."
    });
  }

  // Check 2: Too many unique gap values = no consistent rhythm
  const uniqueGaps = [...new Set(gaps)];
  if (uniqueGaps.length > 3) {
    issues.push({
      title: `${uniqueGaps.length} different vertical gap sizes found`,
      category: "spacing",
      severity: "medium",
      whatsWrong: `Your frame uses ${uniqueGaps.length} unique vertical spacings: ${uniqueGaps.join("px, ")}px. No clear rhythm.`,
      whyItMatters: "Inconsistent gaps signal a lack of intentional layout. It suggests the designer wasn't thinking systematically about spacing.",
      fixSuggestion: "Pick 2–3 spacing values maximum for this screen. Smallest for related items, largest for section breaks. Consistency over variety."
    });
  }

  return issues;
}


// ═══════════════════════════════════════════════════════════
//  RULE 2 — ACCESSIBILITY
//  Checks touch target sizes and invisible text layers.
// ═══════════════════════════════════════════════════════════
function checkAccessibility(node) {
  const issues = [];
  const allNodes = node.findAll(() => true);

  // Check 1: Interactive elements that are too small to tap
  // Looks for layers named "button", "btn", "cta", "tap", "click", "icon"
  const smallTargets = allNodes.filter(n => {
    const name = n.name.toLowerCase();
    const looksInteractive =
      name.includes("button") || name.includes("btn") ||
      name.includes("cta")    || name.includes("tap") ||
      name.includes("click");
    const tooSmall = n.width < 44 || n.height < 44;
    return looksInteractive && tooSmall;
  });

  if (smallTargets.length > 0) {
    issues.push({
      title: `${smallTargets.length} touch target${smallTargets.length > 1 ? "s are" : " is"} below 44×44px`,
      category: "accessibility",
      severity: "high",
      // severity = high because: user CANNOT tap reliably. The action is blocked.
      // This is a functional failure, not a visual one.
      whatsWrong: `Found ${smallTargets.length} interactive element${smallTargets.length > 1 ? "s" : ""} smaller than the 44pt minimum: ${smallTargets.map(n => `"${n.name}" (${Math.round(n.width)}×${Math.round(n.height)}px)`).join(", ")}.`,
      whyItMatters: "Small touch targets cause mis-taps and block task completion, especially for users with motor impairments or in one-handed use.",
      fixSuggestion: "Increase the hit area to at least 44×44px. Keep the visual size small if needed — add invisible padding so the tap zone is large enough."
    });
  }

  // Check 2: Text layers with no fill (invisible text)
  const textNodes = allNodes.filter(n => n.type === "TEXT");
  const noFillText = textNodes.filter(n => {
    // Guard: fills can be a symbol (not an array) on some node types
    if (!n.fills || typeof n.fills !== "object" || !Array.isArray(n.fills)) return false;
    if (n.fills.length === 0) return true;
    // Check if every fill is invisible — safely check each property
    return n.fills.every(f => {
      if (!f) return true;
      if (f.visible === false) return true;
      // opacity lives on the fill object itself — check it exists before using it
      if (typeof f.opacity === "number" && f.opacity === 0) return true;
      return false;
    });
  });

  if (noFillText.length > 0) {
    issues.push({
      title: `${noFillText.length} text layer${noFillText.length > 1 ? "s have" : " has"} no visible fill`,
      category: "accessibility",
      severity: "high",
      // severity = high because: text with no fill is invisible. Content is missing.
      whatsWrong: `Text layer${noFillText.length > 1 ? "s" : ""} "${noFillText.map(n => n.name).join('", "')}" ${noFillText.length > 1 ? "have" : "has"} no fill colour applied.`,
      whyItMatters: "Text with no fill is invisible on screen. This is a design error that silently hides content from users.",
      fixSuggestion: "Apply an explicit fill colour to every text layer. Don't rely on Figma's default — always set it intentionally."
    });
  }

  return issues;
}


// ═══════════════════════════════════════════════════════════
//  RULE 3 — VISUAL HIERARCHY
//  Reads fontSize from every text layer.
//  Checks if the type scale creates clear levels.
// ═══════════════════════════════════════════════════════════
function checkHierarchy(node) {
  const issues = [];
  const textNodes = node.findAll(n => n.type === "TEXT");
  if (textNodes.length < 2) return issues;

  // Collect all font sizes used in this frame
  const fontSizes = textNodes
    .map(n => {
      // fontSize can be figma.mixed (a Symbol) when a text layer has multiple sizes
      if (typeof n.fontSize !== "number") return null;
      return Math.round(n.fontSize);
    })
    .filter(Boolean);

  const uniqueSizes = [...new Set(fontSizes)].sort((a, b) => b - a);

  // Check 1: Too many font sizes = no clear hierarchy
  if (uniqueSizes.length > 5) {
    issues.push({
      title: `${uniqueSizes.length} different font sizes on one screen`,
      category: "hierarchy",
      severity: "medium",
      // severity = medium because: user can still read everything, but
      // scanning is slower and the page feels visually chaotic
      whatsWrong: `This frame uses ${uniqueSizes.length} distinct font sizes: ${uniqueSizes.join("px, ")}px. That's too many levels.`,
      whyItMatters: "When every element competes at a different size, nothing stands out. Users can't quickly scan the page and don't know where to look first.",
      fixSuggestion: "Limit to 3–4 font sizes: one H1, one H2, one body, one caption. Define them as Figma text styles so they're reusable."
    });
  }

  // Check 2: Heading and body text too close in size = flat hierarchy
  const largest = uniqueSizes[0];
  const second  = uniqueSizes[1];
  if (largest && second && (largest - second) < 4) {
    issues.push({
      title: "Heading and body text sizes are too similar",
      category: "hierarchy",
      severity: "medium",
      whatsWrong: `Largest text is ${largest}px and next size is ${second}px — only ${largest - second}px apart. The jump is too small to read as a hierarchy.`,
      whyItMatters: "Without a clear size jump between heading and body, the eye doesn't know where to start reading. This slows comprehension.",
      fixSuggestion: `Increase the gap. If body is ${second}px, the heading should be at least ${second + 8}px — ideally ${second + 12}px or more.`
    });
  }

  return issues;
}


// ═══════════════════════════════════════════════════════════
//  RULE 4 — CONTRAST (approximate)
//  Reads fill colour from text layers.
//  Flags very light fills that are likely to fail contrast.
//  Note: full contrast ratio needs background colour too,
//  which is why this is approximate — we flag risk zones.
// ═══════════════════════════════════════════════════════════
function checkContrast(node) {
  const issues = [];
  const textNodes = node.findAll(n => n.type === "TEXT");

  textNodes.forEach(textNode => {
    // Guard: fills can be figma.mixed (a Symbol) on text with mixed styles
    if (!textNode.fills || typeof textNode.fills !== "object" || !Array.isArray(textNode.fills)) return;
    if (textNode.fills.length === 0) return;

    const fill = textNode.fills.find(f => f && f.type === "SOLID" && f.visible !== false);
    if (!fill || !fill.color) return;

    const { r, g, b } = fill.color;
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
    if (luminance > 0.75) {
      issues.push({
        title: `Light-coloured text in "${textNode.name}"`,
        category: "contrast", severity: "high",
        whatsWrong: `"${textNode.name}" has a very light fill (brightness ~${Math.round(luminance * 100)}%). Likely fails WCAG AA.`,
        whyItMatters: "Low contrast text fails users with visual impairments and is hard to read in bright sunlight.",
        fixSuggestion: "Check contrast with Figma's built-in checker. Aim for 4.5:1 for body text, 3:1 for large text."
      });
    }
  });
  return issues.slice(0, 2);

}


// ═══════════════════════════════════════════════════════════
//  RULE 5 — TYPOGRAPHY
//  Checks if text layers use defined Figma text styles.
//  Checks for too many font families.
// ═══════════════════════════════════════════════════════════
function checkTypography(node) {
  const issues = [];
  const textNodes = node.findAll(n => n.type === "TEXT");
  if (textNodes.length === 0) return issues;

  // Check 1: Text layers with no Figma text style applied
  // textStyleId is null/empty when a layer uses ad-hoc font settings
  const unstyled = textNodes.filter(n => !n.textStyleId);
  const unstyledPct = Math.round((unstyled.length / textNodes.length) * 100);

  if (unstyled.length > 2 && unstyledPct > 50) {
    issues.push({
      title: `${unstyled.length} text layers have no text style applied`,
      category: "typography",
      severity: "medium",
      // severity = medium because: invisible to users but breaks handoff
      // and makes the design system impossible to maintain
      whatsWrong: `${unstyledPct}% of text layers use ad-hoc font settings instead of shared Figma text styles.`,
      whyItMatters: "Unstyled text creates inconsistency at scale. Changing one font size means updating every layer manually instead of one style.",
      fixSuggestion: "Create Figma text styles for Heading, Subheading, Body, and Caption. Apply them to all text layers before handoff."
    });
  }

  // Check 2: Too many font families
  const fontFamilies = [...new Set(
    textNodes.map(n => {
      // fontName can be a Symbol (figma.mixed) when a text layer has multiple fonts
      if (!n.fontName || typeof n.fontName !== "object") return null;
      return n.fontName.family;
    }).filter(Boolean)
  )];

  if (fontFamilies.length > 2) {
    issues.push({
      title: `${fontFamilies.length} font families in use`,
      category: "typography",
      severity: "medium",
      whatsWrong: `Found ${fontFamilies.length} different typefaces: ${fontFamilies.join(", ")}. This is usually unintentional.`,
      whyItMatters: "Multiple font families create visual noise and a lack of cohesion. It also increases load time on the web.",
      fixSuggestion: "Limit to 1–2 font families: one for display/headings, one for body. Audit layers for accidental overrides."
    });
  }

  return issues;
}


// ═══════════════════════════════════════════════════════════
//  RULE 6 — TOUCH TARGETS (icons and nav)
//  Specifically checks icon and navigation layers.
//  Separate from the accessibility check — this targets
//  layers that might not be named "button" but are still tappable.
// ═══════════════════════════════════════════════════════════
function checkTouchTargets(node) {
  const issues = [];
  const allNodes = node.findAll(() => true);

  const smallIcons = allNodes.filter(n => {
    const name = n.name.toLowerCase();
    const looksLikeNav =
      name.includes("icon") || name.includes("nav") ||
      name.includes("tab")  || name.includes("back") ||
      name.includes("close");
    const tooSmall = n.width < 44 || n.height < 44;
    return looksLikeNav && tooSmall && n.type !== "TEXT";
  });

  if (smallIcons.length > 0) {
    issues.push({
      title: `${smallIcons.length} icon or nav element${smallIcons.length > 1 ? "s are" : " is"} too small to tap`,
      category: "accessibility",
      severity: "medium",
      // severity = medium (not high) because: user can still retry mis-taps,
      // but it's noticeably frustrating and causes errors
      whatsWrong: `${smallIcons.length} icon/nav element${smallIcons.length > 1 ? "s" : ""} below 44×44px: ${smallIcons.map(n => `"${n.name}" (${Math.round(n.width)}×${Math.round(n.height)}px)`).join(", ")}.`,
      whyItMatters: "Small nav icons are the #1 cause of accidental taps in bottom navigation, especially during one-handed use.",
      fixSuggestion: "Wrap icons in a transparent 44×44px container. The icon itself stays visually small — the invisible padding handles the tap area."
    });
  }

  return issues;
}


// ═══════════════════════════════════════════════════════════
//  SCORE CALCULATOR
//  Starts at 100. Deducts based on severity.
//  High = −15  (blocks user entirely)
//  Medium = −8 (slows user down)
//  Low = −3    (craft issue, users don't notice)
//  Never goes below 0.
// ═══════════════════════════════════════════════════════════
function calcScore(issues) {
  let score = 100;

  issues.forEach(issue => {
    if (issue.severity === "high")   score -= 15;
    if (issue.severity === "medium") score -= 8;
    if (issue.severity === "low")    score -= 3;
  });

  return Math.max(score, 0);
}
